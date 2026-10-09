/**
 * The legal part of the e-mails of an event (epic 463, lib/email/legal.ts): what an editor wrote for this event, above its partner's and the general legal part.
 *
 * GET /api/events/<mongo id>/email-legal   { name, language, legal, inherited, effective } the event's own legal part per language, the event's language, what it takes from above
 *   (the general one and the partner's), and what applies to the event in its language and where it comes from (viewer)
 * PUT /api/events/<mongo id>/email-legal   { legal } replaces the event's legal part; an empty text takes a language away (manager)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadEventLegal, parseLegal, saveEventLegal } from '@/lib/email/legal';

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
  const loaded = await loadEventLegal(db, event);
  return apiSuccess({ name: String(event.name ?? ''), language: loaded.language, legal: loaded.levels.event, inherited: { global: loaded.levels.global, partner: loaded.levels.partner }, effective: loaded.effective });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event } = await loadEvent(eventId, request, 'manager');
  const body = (await request.json().catch(() => null)) as { legal?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { legal }');
  const parsed = parseLegal(body.legal);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await saveEventLegal(db, String(event.eventId), parsed.value, generateTimestamp());
  return apiSuccess({ legal: parsed.value });
});
