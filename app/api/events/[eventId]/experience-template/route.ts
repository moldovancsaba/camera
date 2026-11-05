/** Read or change the event's one selected journey; styling and media remain event-owned settings. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { hasLegacyLocalJourney, journeyConfigFromStoredTemplate, journeyTemplateForAdmin, parseExperienceTemplateSelection, resolveEventExperienceConfig } from '@/lib/visual-assets/templates';
import { defaultCameraOrigin, defaultGoShortOrigin } from '@/lib/site-hosts';

type Context = { params: Promise<{ eventId: string }> };

async function load(request: NextRequest, context: Context, permission: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event id.');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventId, permission);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  const partner = typeof event.partnerId === 'string'
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId })
    : null;
  return { db, event, partner, session };
}

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { db, event, partner, session } = await load(request, context, 'viewer');
  const templates = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES)
    .find({ level: 'event', ownerId: String(event.eventId) })
    .sort({ updatedAt: -1 })
    .toArray();
  const effective = await resolveEventExperienceConfig(db, event, partner);
  // Read the parent's current default separately from the event's selected
  // version so the selector can explain what “inherit” will make public.
  const inherited = await resolveEventExperienceConfig(db, { ...event, experienceTemplate: { mode: 'inherit' } }, partner);
  const [effectiveTemplate, inheritedTemplate] = await Promise.all([
    effective?.templateId
      ? db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: effective.templateId }, { projection: { name: 1, level: 1 } })
      : Promise.resolve(null),
    inherited?.templateId
      ? db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: inherited.templateId }, { projection: { name: 1, level: 1 } })
      : Promise.resolve(null),
  ]);
  const managerAccess = isGlobalAdminSession(session)
    ? { allowed: true }
    : await getPartnerScopedAccessForEvent(db, String(event._id), session, 'manager');
  // This route configures an Event, so expose only the capability needed by
  // its editor. Global and Partner versions are created in their own editors.
  const canCreateEventTemplate = managerAccess.allowed;
  const captureUrl = `${defaultCameraOrigin()}/capture/${encodeURIComponent(String(event._id))}`;
  const slug = typeof event.shortUrlSlug === 'string' ? event.shortUrlSlug.trim() : '';
  const shortUrl = slug ? `${defaultGoShortOrigin()}/${slug}` : null;
  const storedSelection = event.experienceTemplate;
  const legacyJourney = hasLegacyLocalJourney(event);
  const parsedSelection = storedSelection === undefined || storedSelection === null
    ? null
    : parseExperienceTemplateSelection(storedSelection);
  const requestedTemplateId = parsedSelection?.ok && parsedSelection.value.mode === 'template'
    ? parsedSelection.value.templateId
    : null;
  const requestedTemplate = requestedTemplateId
    ? await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: requestedTemplateId, level: 'event', ownerId: String(event.eventId) })
    : null;
  const selectionNeedsRepair = Boolean(!legacyJourney && storedSelection != null && !parsedSelection?.ok)
    || Boolean(requestedTemplateId && (!requestedTemplate || !journeyConfigFromStoredTemplate(requestedTemplate.config)));
  const selection = legacyJourney
    ? null
    : selectionNeedsRepair || !storedSelection
      ? { mode: 'inherit' as const }
    : parsedSelection?.ok && parsedSelection.value.mode === 'template' && requestedTemplate && journeyConfigFromStoredTemplate(requestedTemplate.config)
        ? parsedSelection.value
        : { mode: 'inherit' as const };
  return apiSuccess({
    selection,
    legacyJourney,
    selectionNeedsRepair,
    effectiveJourney: effective?.templateId ? { templateId: effective.templateId, name: typeof effectiveTemplate?.name === 'string' ? effectiveTemplate.name : null, level: effectiveTemplate?.level ?? null } : null,
    inheritedJourney: inherited?.templateId ? { templateId: inherited.templateId, name: typeof inheritedTemplate?.name === 'string' ? inheritedTemplate.name : null, level: inheritedTemplate?.level ?? null } : null,
    publicLinks: { captureUrl, shortUrl },
    templates: templates.flatMap((template) => {
      const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
      return safe ? [safe] : [];
    }),
    canCreateEventTemplate,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: Context) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event } = await load(request, context, 'manager');
  const body = await request.json().catch(() => null) as { selection?: unknown } | null;
  if (!body || !Object.hasOwn(body, 'selection')) throw apiBadRequest('Send a template selection.');
  const parsed = parseExperienceTemplateSelection(body.selection);
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  if (parsed.value.mode === 'inherit' && hasLegacyLocalJourney(event as Record<string, unknown>)) {
    throw apiBadRequest('Create a named Event Journey from the existing event pages before switching this event to its parent default.');
  }
  if (parsed.value.mode === 'template' && typeof parsed.value.templateId === 'string') {
    const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({
      templateId: parsed.value.templateId,
      level: 'event',
      ownerId: String(event.eventId),
    });
    if (!template) throw apiBadRequest('Choose a template owned by this event.');
    if (!journeyConfigFromStoredTemplate(template.config)) throw apiBadRequest('This Event Journey has invalid saved page data and cannot be selected.');
  }
  // A selection contains only the selected journey id. Event page edits fork
  // into an Event Journey; styling and media remain separate event settings.
  const selection = { mode: parsed.value.mode, ...(parsed.value.mode === 'template' ? { templateId: parsed.value.templateId } : {}) };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { _id: event._id },
    { $set: { experienceTemplate: selection, updatedAt: generateTimestamp() } },
  );
  return apiSuccess({ selection });
});
