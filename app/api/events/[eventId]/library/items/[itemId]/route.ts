/**
 * Delete an event's own upload (camera#361): DELETE `?kind=frames`. Only an item uploaded for this event; it is unassigned from the event first.
 * Events managers of the partner and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload } from '@/lib/library/db';

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
