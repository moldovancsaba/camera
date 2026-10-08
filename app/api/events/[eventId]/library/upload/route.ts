/**
 * Event library upload (camera#361): POST a file as an item that belongs to this event (`scope: 'event'`). It is assigned to the event at once
 * (the event now has its own list, so partner changes no longer replace it) and no other event can take it. An image is not assigned
 * (camera#368): it joins the event's images library, which the picture fields choose from. Multipart: `kind`, `file`, `name`,
 * `description?`, `category?`. Events managers of the partner and global admins.
 */

import { NextRequest } from 'next/server';
import { Document, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiBadRequest, apiCreated, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { KIND_META, isAssignedKind, parseKind } from '@/lib/library/kinds';
import { createLibraryItem } from '@/lib/library/upload';
import { itemView } from '@/lib/library/db';

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requireAuth();
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const form = await request.formData();
  const kind = parseKind(form.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames, logos or images');

  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');

  const input = {
    kind,
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    category: form.get('category') ?? undefined,
    createdBy: session.user.id,
    owner: { scope: 'event' as const, eventId: String(event.eventId), partnerId: typeof event.partnerId === 'string' ? event.partnerId : null },
  };
  const result = await createLibraryItem(db, input);
  if (!result.ok) throw apiBadRequest(result.reason);
  if (!isAssignedKind(kind)) return apiCreated({ item: itemView(kind, result.item), assignment: null });

  const now = generateTimestamp();
  const assignment = { [KIND_META[kind].idField]: result.item[KIND_META[kind].idField], isActive: true, addedAt: now, addedBy: session.user.id };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { eventId: String(event.eventId) },
    { $push: { [kind]: assignment } as Document, $set: { updatedAt: now, ...(kind === 'frames' ? { framesOverridden: true } : { logosOverridden: true }) } }
  );
  return apiCreated({ item: itemView(kind, result.item), assignment });
});
