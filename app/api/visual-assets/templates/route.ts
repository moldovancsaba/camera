/** Reusable, identity-free event experience templates. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiCreated, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { experienceConfigFromEvent, parseExperienceTemplateConfig, resolveEventExperienceConfig, validateTemplateAssetScope, type ExperienceTemplateConfig } from '@/lib/visual-assets/templates';

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
  const templates = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).find(query).sort({ updatedAt: -1 }).limit(200).toArray();
  return apiSuccess({ templates });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLevel(body.level) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) {
    throw apiBadRequest('Send a level and a template name (up to 120 characters).');
  }
  const db = await connectToDatabase();
  const source = await eventForSource(db, body.sourceEventId);
  let ownerId: string | null = null;
  if (body.level === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required.');
  } else {
    const access = await getPartnerScopedAccessForEvent(db, String(source._id), session, 'manager');
    if (!access.allowed) throw apiForbidden('Event manager access is required to save this template.');
    if (body.level === 'partner') ownerId = String(source.partnerId);
    else ownerId = String(source.eventId);
  }
  let config: ExperienceTemplateConfig = experienceConfigFromEvent(source as Record<string, unknown>);
  const partner = typeof source.partnerId === 'string'
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: source.partnerId })
    : null;
  if (body.level !== 'global' && !partner) throw apiBadRequest('The source event must belong to a partner to create a partner or event template.');
  const effective = await resolveEventExperienceConfig(db, source as Record<string, unknown>, partner as Record<string, unknown> | null);
  if (effective) config = effective.config;
  const parsed = parseExperienceTemplateConfig(config);
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  const assetScope = await validateTemplateAssetScope(db, body.level, parsed.config, source as Record<string, unknown>, partner as Record<string, unknown> | null);
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
  await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).insertOne(template);
  return apiCreated({ template });
});
