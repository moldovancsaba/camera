/**
 * An event's own upload (camera#361). Only an item uploaded for this event. Events managers of the partner and global admins.
 *
 * DELETE `?kind=frames|logos|images`: refused with a usage map until event references are removed or replaced. A resolved delete removes only this upload.
 * PATCH `{ kind, name?, messageArea?, isActive? }`: edit an own upload or switch it on/off for this event. Inactive assets cannot be newly selected or rendered.
 *   Generated frames that use a changed frame/message area are redrawn afterwards.
 */

import { NextRequest } from 'next/server';
import { afterResponse } from '@/lib/api/after-response';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { regenerateEventsUsingFrame } from '@/lib/frame/regenerate';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { KIND_META, parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload, itemView, updateLibraryUpload } from '@/lib/library/db';
import { findAssetUsages } from '@/lib/library/usages';

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { eventId, itemId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames, logos or images');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) }, { projection: { eventId: 1 } });
  if (!event) throw apiNotFound('Event');
  const item = await db.collection(KIND_META[kind].collection).findOne({ [KIND_META[kind].idField]: itemId, scope: 'event', eventId: String(event.eventId) });
  if (item) {
    const urls = [item.imageUrl, item.thumbnailUrl].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const dependencies = await findAssetUsages(db, kind, itemId, urls, { ownerIds: new Set([eventId]) });
    if (dependencies.total || dependencies.truncated) throw apiError(`This ${kind === 'images' ? 'image' : kind === 'frames' ? 'frame' : 'logo'} is still used here. Open each listed place, remove or replace the use, then return and retry deletion.`, 409, { kind, assetId: itemId, usages: dependencies.usages, total: dependencies.total, truncated: dependencies.truncated });
  }
  const result = await deleteLibraryUpload(db, kind, itemId, { scope: 'event', eventId: String(event.eventId) });
  // The reason names the kind ("Frame not found", "Image not found").
  if (!result.ok) {
    const details = result.status === 409 ? await findAssetUsages(db, kind, itemId, [], { ownerIds: new Set([eventId]) }) : null;
    throw apiError(result.reason, result.status, details ? { kind, assetId: itemId, usages: details.usages, total: details.total, truncated: details.truncated } : undefined);
  }
  return apiSuccess({ deleted: itemId });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { eventId, itemId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind) throw apiBadRequest('kind must be frames, logos or images');
  if (body.name === undefined && body.messageArea === undefined && body.isActive === undefined) throw apiBadRequest('Nothing to change: send name, messageArea or isActive');
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) }, { projection: { eventId: 1 } });
  if (!event) throw apiNotFound('Event');
  const result = await updateLibraryUpload(db, kind, itemId, { scope: 'event', eventId: String(event.eventId) }, { name: body.name, messageArea: body.messageArea, isActive: body.isActive }, generateTimestamp());
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : kind === 'logos' ? 'Logo' : 'Image') : apiError(result.reason, result.status);
  if (kind === 'frames' && (body.messageArea !== undefined || body.isActive !== undefined)) afterResponse(() => regenerateEventsUsingFrame(db, itemId).then((done) => { if (done.failed.length) console.error('Frame images could not be redrawn', done.failed); }));
  return apiSuccess({ item: itemView(kind, result.item) });
});
