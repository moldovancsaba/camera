/**
 * "Keep as own" for a logo the library no longer has (issue 421, lib/slots/logo-store.ts `keepLostLogoAsOwn`)
 *
 * POST `{ id }`: the logo this event chose and the library lost becomes the event's own logo, made from the event's snapshot of it, in every place of the event that used it.
 *      Answers the new panels. Events managers and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiForbidden, apiNotFound, apiError } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { keepLostLogoAsOwn, loadEventLogoPanels } from '@/lib/slots/logo-store';

type Context = { params: Promise<{ eventId: string }> };

export const POST = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth();
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== 'string' || !body.id) throw apiBadRequest('id is required');
  const result = await keepLostLogoAsOwn(db, event, body.id, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  const saved = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  return apiSuccess({ logoId: result.value.logoId, places: result.value.places, panels: await loadEventLogoPanels(db, saved ?? event) });
});
