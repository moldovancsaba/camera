/**
 * Event library API (camera#361, docs/LIBRARIES.md)
 *
 * GET `?kind=frames`: what the event has assigned (with pictures), and what it can still take: the items of its partner's library and its own uploads.
 * An event never picks from the global library directly. Anyone with partner access to the event, and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { loadEventLibrary } from '@/lib/library/db';

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requireAuth();
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames or logos');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'viewer');
  if (!access.allowed) throw apiForbidden('Partner-level Events access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  return apiSuccess(await loadEventLibrary(db, event, kind));
});
