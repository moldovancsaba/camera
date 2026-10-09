/**
 * The logo of an event on the slot model (camera#419, lib/slots/logo-store.ts)
 *
 * GET: the panels of the event: its logo and each place of use, with what each uses now, what it takes from above and what it chose itself, and the logos
 *      the editor can pick (the partner's library and the event's own uploads). Anyone with partner access to the event.
 * PUT: `{ slotId, value }`, `value` being `{ items?, useDefault? }`: the event chooses (use the default, add more, replace, none). The first save of an event
 *      that is not on the model yet seeds its slots from its old list so it keeps showing what it showed. Events managers and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiForbidden, apiNotFound, apiError } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadEventLogoPanels, setEventLogoSlot } from '@/lib/slots/logo-store';

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
  return apiSuccess(await loadEventLogoPanels(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { eventId } = await context.params;
  const { db, event } = await loadEvent(eventId, 'manager');
  const body = (await request.json().catch(() => null)) as { slotId?: unknown; value?: unknown } | null;
  if (!body || typeof body.slotId !== 'string') throw apiBadRequest('slotId is required');
  const result = await setEventLogoSlot(db, event, body.slotId, body.value ?? {}, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  const saved = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  return apiSuccess({ seeded: result.value.seeded, panels: await loadEventLogoPanels(db, saved ?? event) });
});
