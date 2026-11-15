/** Edit a journey, or delete an unused version. Selected versions cannot be removed. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { journeyTemplateForAdmin, makeGlobalJourneyConfig, makePartnerJourneyConfig, parseExperienceTemplateConfig, validateTemplateAssetScope, type ExperienceTemplateConfig } from '@/lib/visual-assets/templates';

const PAGE_TYPES = new Set(['who-are-you', 'accept', 'cta', 'take-photo', 'submit', 'restart', 'welcome', 'frame-message-selection']);

function validateJourneyPages(config: ExperienceTemplateConfig): string | null {
  if (!Array.isArray(config.customPages)) return 'A journey must contain its editable page list.';
  if (config.customPages.length > 100) return 'A journey can contain at most 100 pages.';
  const ids = new Set<string>();
  let hasActiveCapture = false;
  for (const value of config.customPages) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Each journey page must be an object.';
    const page = value as Record<string, unknown>;
    if (typeof page.pageId !== 'string' || !page.pageId || ids.has(page.pageId)) return 'Every journey page needs a unique id.';
    ids.add(page.pageId);
    if (typeof page.pageType !== 'string' || !PAGE_TYPES.has(page.pageType)) return 'A journey page has an unsupported page type.';
    if (typeof page.order !== 'number' || !Number.isFinite(page.order) || typeof page.isActive !== 'boolean') return 'Every journey page needs a valid order and visibility setting.';
    if (!page.config || typeof page.config !== 'object' || Array.isArray(page.config)) return 'Every journey page needs page settings.';
    const pageConfig = page.config as Record<string, unknown>;
    if (['title', 'description', 'buttonText'].some((key) => pageConfig[key] !== undefined && (typeof pageConfig[key] !== 'string' || pageConfig[key].length > 2000))) return 'Journey page text must be 2,000 characters or fewer.';
    if (page.pageType === 'take-photo' && page.isActive) hasActiveCapture = true;
  }
  if (!hasActiveCapture) return 'The required photo capture step must remain visible in every journey.';

  if (config.defaultPageOrders !== undefined) {
    if (!config.defaultPageOrders || typeof config.defaultPageOrders !== 'object' || Array.isArray(config.defaultPageOrders)) {
      return 'Default journey page positions must be an object.';
    }
    const allowedDefaults = new Set(['default-welcome', 'default-consent', 'default-identity', 'default-frame-message-selection']);
    for (const [pageId, order] of Object.entries(config.defaultPageOrders)) {
      if (!allowedDefaults.has(pageId) || typeof order !== 'number' || !Number.isFinite(order) || Math.abs(order) > 10_000) {
        return 'A default journey page position is invalid.';
      }
    }
  }

  if (config.frameMessageSelectionDisplay !== undefined
    && !['automatic', 'show', 'hide', 'messages-only'].includes(String(config.frameMessageSelectionDisplay))) {
    return 'Frame and message selection mode is invalid.';
  }
  return null;
}

async function loadOwnedTemplate(db: Awaited<ReturnType<typeof connectToDatabase>>, templateId: string, session: Awaited<ReturnType<typeof requireAuth>>, permission: 'viewer' | 'manager') {
  const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId });
  if (!template) throw apiNotFound('Experience template');
  const level = template.level;
  if (level === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required.');
  } else if (level === 'partner') {
    // Templates store the partner's public partnerId, while the workspace
    // authorizer intentionally accepts the Mongo _id. Resolve the record
    // before checking access so rename/delete work for partner-owned journeys.
    const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: String(template.ownerId) });
    if (!partner) throw apiNotFound('Template partner');
    const access = await assertPartnerMongoWorkspaceAccess(db, session, String(partner._id), permission);
    if (!access.partner) throw apiForbidden('Partner access is required.');
  } else if (level === 'event') {
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: String(template.ownerId) });
    if (!event) throw apiNotFound('Template event');
    const access = await getPartnerScopedAccessForEvent(db, String(event._id), session, permission);
    if (!access.allowed) throw apiForbidden('Event access is required.');
  } else {
    throw apiBadRequest('Template owner level is invalid.');
  }
  return template;
}

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ templateId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { templateId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw apiBadRequest('Journey update is required.');
  if (!Object.hasOwn(body, 'name') && !Object.hasOwn(body, 'pages') && !Object.hasOwn(body, 'config')) throw apiBadRequest('Send a journey name or page edits.');
  const db = await connectToDatabase();
  const template = await loadOwnedTemplate(db, templateId, session, 'manager');
  const safeTemplate = journeyTemplateForAdmin(template as Record<string, unknown>);
  const canonicalConfig = safeTemplate?.config;
  if (!canonicalConfig) throw apiBadRequest('This journey has invalid saved page data and cannot be edited.');
  const updates: Record<string, unknown> = { updatedAt: generateTimestamp(), updatedBy: session.user.id };
  let nextConfig: ExperienceTemplateConfig = canonicalConfig;
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw apiBadRequest('Journey name must be 1–120 characters.');
    updates.name = body.name.trim();
  }
  if (Object.hasOwn(body, 'pages')) {
    if (!Array.isArray(body.pages) || !Array.isArray(canonicalConfig.customPages)) throw apiBadRequest('This journey has no editable page list.');
    const existingPages = canonicalConfig.customPages as Array<Record<string, unknown>>;
    const incoming = body.pages as Array<Record<string, unknown>>;
    if (incoming.length !== existingPages.length) throw apiBadRequest('Journey edits must preserve all existing pages.');
    const updatesById = new Map<string, Record<string, unknown>>();
    for (const page of incoming) {
      if (!page || typeof page.pageId !== 'string' || updatesById.has(page.pageId)
        || !Number.isFinite(page.order) || typeof page.isActive !== 'boolean'
        || !['title', 'description', 'buttonText'].every((field) => page[field] === undefined || (typeof page[field] === 'string' && page[field].length <= 2000))) {
        throw apiBadRequest('Each page needs a unique id, numeric order, visibility, and valid copy.');
      }
      updatesById.set(page.pageId, page);
    }
    if (existingPages.some((page) => typeof page.pageId !== 'string' || !updatesById.has(page.pageId))) throw apiBadRequest('Journey edits must preserve every existing page.');
    const customPages = existingPages.map((page) => {
      const edited = updatesById.get(String(page.pageId))!;
      if (page.pageType === 'take-photo' && page.isActive !== false && edited.isActive === false) {
        throw apiBadRequest('The photo-capture step is required and cannot be hidden.');
      }
      const config = page.config && typeof page.config === 'object' && !Array.isArray(page.config) ? { ...(page.config as Record<string, unknown>) } : {};
      for (const field of ['title', 'description', 'buttonText']) {
        if (typeof edited[field] === 'string') config[field] = edited[field];
      }
      return { ...page, order: edited.order, isActive: edited.isActive, config };
    });
    nextConfig = { ...canonicalConfig, customPages };
  }
  if (Object.hasOwn(body, 'config')) {
    const parsed = parseExperienceTemplateConfig(body.config);
    if (!parsed.ok) throw apiBadRequest(parsed.reason);
    nextConfig = parsed.config;
  }
  const normalizedConfig = template.level === 'global'
    ? makeGlobalJourneyConfig(nextConfig)
    : template.level === 'partner'
      ? makePartnerJourneyConfig(nextConfig)
      : nextConfig;
  if (Object.hasOwn(body, 'config') || Object.hasOwn(body, 'pages')) {
    const pageError = validateJourneyPages(normalizedConfig);
    if (pageError) throw apiBadRequest(pageError);
  }

  let sourceEvent: Record<string, unknown> = {};
  let partner: Record<string, unknown> | null = null;
  if (template.level === 'partner') {
    partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: String(template.ownerId) });
  } else if (template.level === 'event') {
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: String(template.ownerId) });
    if (!event) throw apiNotFound('Template event');
    sourceEvent = event;
    partner = typeof event.partnerId === 'string'
      ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId })
      : null;
  }
  const assetScope = await validateTemplateAssetScope(db, template.level, normalizedConfig, sourceEvent, partner);
  if (!assetScope.ok) throw apiBadRequest(assetScope.reason);
  updates.config = normalizedConfig;
  await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).updateOne({ templateId }, { $set: updates });
  const saved = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId });
  return apiSuccess({ template: saved ? journeyTemplateForAdmin(saved as Record<string, unknown>) : null });
});

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ templateId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { templateId } = await context.params;
  const db = await connectToDatabase();
  await loadOwnedTemplate(db, templateId, session, 'manager');
  const [globalDefault, partnerUse, eventUse] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).countDocuments({ settingId: 'default-experience-template', templateId }),
    db.collection(COLLECTIONS.PARTNERS).countDocuments({ defaultExperienceTemplateId: templateId }),
    db.collection(COLLECTIONS.EVENTS).countDocuments({ 'experienceTemplate.templateId': templateId }),
  ]);
  if (globalDefault + partnerUse + eventUse > 0) {
    const dependencies = [
      globalDefault ? `global default (${globalDefault})` : null,
      partnerUse ? `partner default${partnerUse === 1 ? '' : 's'} (${partnerUse})` : null,
      eventUse ? `event selection${eventUse === 1 ? '' : 's'} (${eventUse})` : null,
    ].filter(Boolean).join(', ');
    throw apiError(`This journey is still selected by ${dependencies}. Change those selections before deleting it.`, 409);
  }
  const deleted = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).deleteOne({ templateId });
  if (!deleted.deletedCount) throw apiNotFound('Experience template');
  return apiSuccess({ deleted: templateId });
});
