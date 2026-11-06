/** Read or change this partner's default experience without opening the rest of partner administration. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { journeyConfigFromStoredTemplate, journeyTemplateForAdmin } from '@/lib/visual-assets/templates';

type Context = { params: Promise<{ partnerId: string }> };

async function load(request: NextRequest, context: Context, permission: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  if (!ObjectId.isValid(partnerId)) throw apiBadRequest('Invalid partner id.');
  const db = await connectToDatabase();
  const access = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, permission);
  return { db, partner: access.partner };
}

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { db, partner } = await load(request, context, 'viewer');
  const [templates, sourceEvents, testEvents] = await Promise.all([
    db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES)
      .find({ level: 'partner', ownerId: String(partner.partnerId) })
      .sort({ updatedAt: -1 })
      .toArray(),
    db.collection(COLLECTIONS.EVENTS)
      .find({ partnerId: String(partner.partnerId) }, { projection: { _id: 1, name: 1, eventId: 1, eventDate: 1 } })
      .sort({ updatedAt: -1 })
      .toArray(),
    db.collection(COLLECTIONS.EVENTS)
      .find({ partnerId: String(partner.partnerId), isActive: { $ne: false } }, { projection: { _id: 1, name: 1, eventId: 1, eventDate: 1 } })
      .sort({ updatedAt: -1 })
      .toArray(),
  ]);
  const requestedId = typeof partner.defaultExperienceTemplateId === 'string' ? partner.defaultExperienceTemplateId : null;
  const selectedTemplate = requestedId
    ? await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: requestedId, level: 'partner', ownerId: String(partner.partnerId) })
    : null;
  const selected = Boolean(selectedTemplate && journeyConfigFromStoredTemplate(selectedTemplate.config));
  const safeTemplates = templates.flatMap((template) => {
    const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
    return safe ? [safe] : [];
  });
  const [globalSetting, globalTemplates] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'default-experience-template' }),
    db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES)
      .find({ level: 'global', ownerId: null })
      .sort({ updatedAt: -1 })
      .toArray(),
  ]);
  const globalTemplate = typeof globalSetting?.templateId === 'string'
    ? await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: globalSetting.templateId, level: 'global', ownerId: null })
    : null;
  const safeGlobalTemplate = globalTemplate ? journeyTemplateForAdmin(globalTemplate as Record<string, unknown>) : null;
  return apiSuccess({
    templateId: selected ? requestedId : 'inherit',
    selectionNeedsRepair: Boolean(requestedId && !selected),
    templates: safeTemplates,
    sourceEvents: sourceEvents
      .filter((event) => event._id instanceof ObjectId)
      .map((event) => ({ _id: String(event._id), eventId: event.eventId, name: event.name, eventDate: event.eventDate })),
    testEvents: testEvents
      .filter((event) => event._id instanceof ObjectId)
      .map((event) => ({ _id: String(event._id), eventId: event.eventId, name: event.name, eventDate: event.eventDate })),
    globalTemplates: globalTemplates.flatMap((template) => {
      const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
      return safe ? [safe] : [];
    }),
    globalTemplateId: safeGlobalTemplate?.templateId ?? null,
    globalTemplateName: safeGlobalTemplate?.name ?? null,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: Context) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, partner } = await load(request, context, 'manager');
  const body = await request.json().catch(() => null) as { templateId?: unknown } | null;
  if (!body || !Object.hasOwn(body, 'templateId')) throw apiBadRequest('Send a partner templateId or "inherit" to follow the global default.');
  const templateId = body.templateId;
  const update: Record<string, unknown> = { updatedAt: generateTimestamp() };
  const unset: Record<string, ''> = {};
  if (templateId === 'inherit') {
    unset.defaultExperienceTemplateId = '';
  } else if (typeof templateId === 'string' && templateId.trim().length > 0 && templateId.length <= 100) {
    const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({
      templateId,
      level: 'partner',
      ownerId: String(partner.partnerId),
    });
    if (!template) throw apiBadRequest('Choose a template owned by this partner.');
    if (!journeyConfigFromStoredTemplate(template.config)) throw apiBadRequest('This Partner Journey has invalid saved page data and cannot be selected.');
    update.defaultExperienceTemplateId = templateId;
  } else {
    throw apiBadRequest('templateId must be a partner-owned journey or "inherit".');
  }
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: String(partner.partnerId) },
    { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: String(partner.partnerId) });
  if (!saved) throw apiNotFound('Partner');
  return apiSuccess({ templateId: typeof saved.defaultExperienceTemplateId === 'string' ? saved.defaultExperienceTemplateId : 'inherit' });
});
