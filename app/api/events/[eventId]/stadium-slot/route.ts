/**
 * The stadium backgrounds of an event (issue 326, lib/slots/stadium-store.ts): an event with nothing stored follows its partner, which follows the global stadium backgrounds; one of what it uses is picked
 * once for the stage of its default slideshow (lib/screen/stage-background.ts).
 *
 * GET: what the event uses, what it chose itself, what its partner gives and what it can pick (what the partner uses, the partner's uploads and its own). Anyone with partner access to the event.
 * PUT: `{ value }`, `value` being `{ items?, useDefault? }`: use the default (nothing), add more, replace, or none. Events managers and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiForbidden, apiNotFound, apiError } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadEventStadiumPanel, setEventStadium } from '@/lib/slots/stadium-store';

type Context = { params: Promise<{ eventId: string }> };

async function loadEvent(eventId: string, minRole: 'viewer' | 'manager') {
  const session = await requireAuth();
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, minRole);
  if (!access.allowed) throw apiForbidden(minRole === 'manager' ? 'Partner-level Events manager access is required' : 'Partner-level Events access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const GET = withErrorHandler(async (_request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  const { db, event } = await loadEvent(eventId, 'viewer');
  return apiSuccess(await loadEventStadiumPanel(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  const { db, event } = await loadEvent(eventId, 'manager');
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  if (!body) throw apiBadRequest('A body with a value is required');
  const result = await setEventStadium(db, event, body.value ?? {}, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  const saved = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  return apiSuccess(await loadEventStadiumPanel(db, saved ?? event));
});
