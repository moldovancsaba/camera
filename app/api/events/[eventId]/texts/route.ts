/**
 * The wordings of an event (issue 353, lib/i18n/overrides.ts): what an editor wrote for this event, above the partner's and the global wordings.
 *
 * GET /api/events/<mongo id>/texts   { language, texts, inherited } the event's own wordings, its language, and what it takes from above: the global and the partner's (viewer)
 * PUT /api/events/<mongo id>/texts   { texts } replaces the event's wordings; an empty text takes one away (manager)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadEventTexts, parseTexts, saveEventTexts } from '@/lib/i18n/overrides';

type Context = { params: Promise<{ eventId: string }> };

async function loadEvent(eventId: string, request: NextRequest, minRole: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, minRole);
  if (!access.allowed) throw apiForbidden(minRole === 'manager' ? 'Partner-level Events manager access is required' : 'Partner-level Events access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  const { db, event } = await loadEvent(eventId, request, 'viewer');
  const loaded = await loadEventTexts(db, event);
  return apiSuccess({ name: String(event.name ?? ''), language: loaded.language, texts: loaded.levels.event, inherited: { global: loaded.levels.global, partner: loaded.levels.partner } });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event } = await loadEvent(eventId, request, 'manager');
  const body = (await request.json().catch(() => null)) as { texts?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { texts }');
  const parsed = parseTexts(body.texts);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await saveEventTexts(db, String(event.eventId), parsed.value, generateTimestamp());
  return apiSuccess({ texts: parsed.value });
});
