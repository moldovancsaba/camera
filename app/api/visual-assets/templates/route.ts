/** Reusable, identity-free event experience templates. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiCreated, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { experienceConfigFromEvent, journeyConfigFromStoredTemplate, journeyTemplateForAdmin, makeGlobalJourneyConfig, makePartnerJourneyConfig, parseExperienceTemplateConfig, resolveEventExperienceConfig, validateTemplateAssetScope, type ExperienceTemplateConfig } from '@/lib/visual-assets/templates';

type Level = 'global' | 'partner' | 'event';
const isLevel = (value: unknown): value is Level => value === 'global' || value === 'partner' || value === 'event';

async function eventForSource(db: Awaited<ReturnType<typeof connectToDatabase>>, value: unknown) {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) throw apiBadRequest('sourceEventId must be an event id.');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(value) });
  if (!event) throw apiNotFound('Event');
  return event;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  const level = request.nextUrl.searchParams.get('level');
  const ownerId = request.nextUrl.searchParams.get('ownerId');
  if (!isLevel(level)) throw apiBadRequest('level must be global, partner or event.');
  const db = await connectToDatabase();
  const query: Record<string, unknown> = { level };
  if (level === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required.');
    query.ownerId = null;
  } else if (level === 'partner') {
    if (!ownerId) throw apiBadRequest('ownerId is required for partner templates.');
    const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: ownerId });
    if (!partner) throw apiNotFound('Partner');
    const access = await assertPartnerMongoWorkspaceAccess(db, session, String(partner._id), 'viewer');
    query.ownerId = String(access.partner.partnerId);
  } else {
    if (!ownerId) throw apiBadRequest('ownerId is required for event templates.');
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: ownerId });
    if (!event) throw apiNotFound('Event');
    const access = await getPartnerScopedAccessForEvent(db, String(event._id), session, 'viewer');
    if (!access.allowed) throw apiForbidden('Event access is required.');
    query.ownerId = String(event.eventId);
  }
  const templates = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).find(query).sort({ updatedAt: -1 }).toArray();
  return apiSuccess({ templates: templates.flatMap((template) => {
    const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
    return safe ? [safe] : [];
  }) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLevel(body.level) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) {
    throw apiBadRequest('Send a level and a template name (up to 120 characters).');
  }
  if (Object.hasOwn(body, 'makeDefault')) throw apiBadRequest('Creating a journey version never changes the active journey. Select it in the level settings to make it the default.');
  const hasEventSource = typeof body.sourceEventId === 'string';
  const hasTemplateSource = typeof body.sourceTemplateId === 'string';
  if (hasEventSource === hasTemplateSource) throw apiBadRequest('Choose exactly one source event or source journey.');
  const db = await connectToDatabase();
  let sourceEvent: Record<string, unknown> | null = null;
  let partner: Record<string, unknown> | null = null;
  let ownerId: string | null = null;
  let config: ExperienceTemplateConfig;

  if (body.level === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required.');
    if (hasEventSource) {
      sourceEvent = await eventForSource(db, body.sourceEventId) as Record<string, unknown>;
      partner = typeof sourceEvent.partnerId === 'string'
        ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: sourceEvent.partnerId }) as Record<string, unknown> | null
        : null;
      const effective = await resolveEventExperienceConfig(db, sourceEvent, partner);
      config = effective?.config ?? experienceConfigFromEvent(sourceEvent);
    } else {
      const sourceTemplate = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: body.sourceTemplateId, level: 'global', ownerId: null });
      const safe = sourceTemplate ? journeyTemplateForAdmin(sourceTemplate as Record<string, unknown>) : null;
      if (!safe) throw apiBadRequest('Choose a valid Global Journey as the source.');
      config = safe.config;
    }
    config = makeGlobalJourneyConfig(config);
  } else if (body.level === 'partner') {
    if (typeof body.partnerMongoId !== 'string') throw apiBadRequest('partnerMongoId is required to create a Partner Journey.');
    const access = await assertPartnerMongoWorkspaceAccess(db, session, body.partnerMongoId, 'manager');
    partner = access.partner;
    ownerId = access.partnerId;
    if (hasEventSource) {
      sourceEvent = await eventForSource(db, body.sourceEventId) as Record<string, unknown>;
      if (String(sourceEvent.partnerId ?? '') !== ownerId) throw apiForbidden('The source event must belong to this partner.');
      const effective = await resolveEventExperienceConfig(db, sourceEvent, partner);
      config = effective?.config ?? experienceConfigFromEvent(sourceEvent);
    } else {
      const sourceTemplate = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: body.sourceTemplateId });
      const sourceOwnerAllowed = sourceTemplate?.level === 'global' && sourceTemplate.ownerId === null
        || sourceTemplate?.level === 'partner' && String(sourceTemplate.ownerId) === ownerId;
      const safe = sourceTemplate && sourceOwnerAllowed ? journeyTemplateForAdmin(sourceTemplate as Record<string, unknown>) : null;
      if (!safe) throw apiBadRequest('Choose the selected Global Journey or a journey owned by this partner as the source.');
      config = safe.config;
    }
    // A partner can create a journey before it has any events. For asset-scope
    // validation, the partner itself is the destination; event-only catalogs
    // are not required to save a reusable Partner Journey.
    sourceEvent ??= { partnerId: ownerId };
    // Keep identity and consent owned by each child event. A Partner Journey
    // describes the reusable flow around those event-specific steps.
    config = makePartnerJourneyConfig(config);
  } else {
    sourceEvent = await eventForSource(db, body.sourceEventId) as Record<string, unknown>;
    const access = await getPartnerScopedAccessForEvent(db, String(sourceEvent._id), session, 'manager');
    if (!access.allowed) throw apiForbidden('Event manager access is required to save this template.');
    ownerId = String(sourceEvent.eventId);
    partner = typeof sourceEvent.partnerId === 'string'
      ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: sourceEvent.partnerId }) as Record<string, unknown> | null
      : null;
    if (!partner) throw apiBadRequest('The source event must belong to a partner to create an Event Journey.');
    const effective = await resolveEventExperienceConfig(db, sourceEvent, partner);
    config = effective?.config ?? experienceConfigFromEvent(sourceEvent);
  }

  const parsed = parseExperienceTemplateConfig(config);
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  const assetScope = await validateTemplateAssetScope(db, body.level, parsed.config, sourceEvent ?? {}, partner);
  if (!assetScope.ok) throw apiBadRequest(assetScope.reason);
  const now = generateTimestamp();
  const template = {
    templateId: generateId(),
    level: body.level,
    ownerId,
    name: body.name.trim(),
    config: parsed.config,
    createdAt: now,
    updatedAt: now,
    updatedBy: session.user.id,
  };
  // Creation only adds an available version. The explicit level-selection APIs
  // control which version descendants inherit and which event links serve.
  await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).insertOne(template);
  if (body.level === 'global') {
    const settings = db.collection(COLLECTIONS.ADMIN_SETTINGS);
    const current = await settings.findOne({ settingId: 'default-experience-template' });
    const selected = typeof current?.templateId === 'string'
      ? await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: current.templateId, level: 'global', ownerId: null })
      : null;
    // A stale record is not a usable default. Repair it when the first valid
    // journey is created so every inheriting partner/event has a real flow.
    if (!selected || !journeyConfigFromStoredTemplate(selected.config)) {
      await settings.updateOne(
        { settingId: 'default-experience-template' },
        { $set: { settingId: 'default-experience-template', templateId: template.templateId, updatedAt: now, updatedBy: session.user.email ?? null } },
        { upsert: true },
      );
    }
  }
  return apiCreated({ template });
});
