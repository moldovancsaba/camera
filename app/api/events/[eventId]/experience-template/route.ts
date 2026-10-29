/** Read or change one event's template choice; the event's regular config API stores later field-level overrides. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { parseExperienceTemplateSelection, resolveEventExperienceConfig } from '@/lib/visual-assets/templates';

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
    .limit(200)
    .toArray();
  const effective = await resolveEventExperienceConfig(db, event, partner);
  const managerAccess = isGlobalAdminSession(session)
    ? { allowed: true }
    : await getPartnerScopedAccessForEvent(db, String(event._id), session, 'manager');
  const canCreateTemplateLevels = managerAccess.allowed
    ? isGlobalAdminSession(session) ? ['global', 'partner', 'event'] : ['partner', 'event']
    : [];
  return apiSuccess({ selection: event.experienceTemplate ?? null, effectiveTemplateId: effective?.templateId ?? null, templates, canCreateTemplateLevels });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: Context) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event } = await load(request, context, 'manager');
  const body = await request.json().catch(() => null) as { selection?: unknown } | null;
  if (!body || !Object.hasOwn(body, 'selection')) throw apiBadRequest('Send a template selection.');
  if (body.selection === null) {
    await db.collection(COLLECTIONS.EVENTS).updateOne(
      { _id: event._id },
      { $unset: { experienceTemplate: '' }, $set: { updatedAt: generateTimestamp() } },
    );
    return apiSuccess({ selection: null });
  }
  const parsed = parseExperienceTemplateSelection(body.selection);
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  if (parsed.value.mode === 'template' && typeof parsed.value.templateId === 'string') {
    const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({
      templateId: parsed.value.templateId,
      level: 'event',
      ownerId: String(event.eventId),
    });
    if (!template) throw apiBadRequest('Choose a template owned by this event.');
  }
  // Changing the selected preset intentionally clears the previous preset's
  // overrides. New edits made after selection are preserved as overrides by
  // PATCH /api/events/[eventId].
  const selection = { mode: parsed.value.mode, ...(parsed.value.mode === 'template' ? { templateId: parsed.value.templateId ?? null } : {}) };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { _id: event._id },
    { $set: { experienceTemplate: selection, updatedAt: generateTimestamp() } },
  );
  return apiSuccess({ selection });
});
