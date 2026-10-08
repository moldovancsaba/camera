/**
 * An event's own upload (camera#361). Only an item uploaded for this event. Events managers of the partner and global admins.
 *
 * DELETE `?kind=frames`: it is unassigned from the event first.
 * PATCH `{ kind, name?, messageArea? }` (camera#366): rename it, or say where a message is written on it (null removes the message area). The events whose messages
 *   are written on this frame are redrawn afterwards.
 */

import { NextRequest } from 'next/server';
import { afterResponse } from '@/lib/api/after-response';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { regenerateEventsUsingFrame } from '@/lib/frame/regenerate';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload, itemView, updateLibraryUpload } from '@/lib/library/db';

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { eventId, itemId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames or logos');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) }, { projection: { eventId: 1 } });
  if (!event) throw apiNotFound('Event');
  const result = await deleteLibraryUpload(db, kind, itemId, { scope: 'event', eventId: String(event.eventId) });
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : 'Logo') : apiError(result.reason, result.status);
  return apiSuccess({ deleted: itemId });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { eventId, itemId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind) throw apiBadRequest('kind must be frames or logos');
  if (body.name === undefined && body.messageArea === undefined) throw apiBadRequest('Nothing to change: send name or messageArea');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) }, { projection: { eventId: 1 } });
  if (!event) throw apiNotFound('Event');
  const result = await updateLibraryUpload(db, kind, itemId, { scope: 'event', eventId: String(event.eventId) }, { name: body.name, messageArea: body.messageArea }, generateTimestamp());
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : 'Logo') : apiError(result.reason, result.status);
  if (body.messageArea !== undefined) afterResponse(() => regenerateEventsUsingFrame(db, itemId).then((done) => { if (done.failed.length) console.error('Frame images could not be redrawn', done.failed); }));
  return apiSuccess({ item: itemView(kind, result.item) });
});
