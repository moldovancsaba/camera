/**
 * Upload a sample selfie for an event (issue 540): a library image with the sample selfie tag that belongs to the event (`scope: 'event'`) and joins what the event chose at once; no other event
 * can take it. Multipart: `file`, `name`, `description?`. Events managers and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiBadRequest, apiCreated, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { itemView } from '@/lib/library/db';
import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { createLibraryItem } from '@/lib/library/upload';
import { addSelfieToEventSlot } from '@/lib/slots/selfie-store';

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requireAuth();
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const form = await request.formData();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  const result = await createLibraryItem(db, {
    kind: 'images',
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    createdBy: session.user.id,
    owner: { scope: 'event', eventId: String(event.eventId), partnerId: typeof event.partnerId === 'string' ? event.partnerId : null },
    tags: [SAMPLE_SELFIE_TAG],
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  const added = await addSelfieToEventSlot(db, event, String(result.item.pictureId), generateTimestamp());
  if (!added.ok) throw apiBadRequest(added.reason);
  return apiCreated({ item: itemView('images', result.item) });
});
