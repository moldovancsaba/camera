/**
 * A partner's own upload (camera#361). Only an item uploaded for this partner. Partner managers and global admins.
 *
 * DELETE `?kind=frames|logos|images`: refused (409) with every partner/event use until references are removed or replaced. A resolved delete removes only this upload.
 * PATCH `{ kind, name?, messageArea?, isActive? }`: edit its name/frame message area or switch the source upload on/off. Inactive source assets are unavailable to descendants.
 *   Events whose generated frames use a changed frame or message area are redrawn afterwards.
 */

import { NextRequest } from 'next/server';
import { afterResponse } from '@/lib/api/after-response';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiNotFound } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { regenerateEventsUsingFrame } from '@/lib/frame/regenerate';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { KIND_META, parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload, itemView, updateLibraryUpload } from '@/lib/library/db';
import { findAssetUsages } from '@/lib/library/usages';

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { partnerId, itemId } = await context.params;
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames, logos or images');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const item = await db.collection(KIND_META[kind].collection).findOne({ [KIND_META[kind].idField]: itemId, scope: 'partner', partnerId: String(partner.partnerId) });
  if (item) {
    const urls = [item.imageUrl, item.thumbnailUrl].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const eventRows = await db.collection(COLLECTIONS.EVENTS).find({ partnerId: String(partner.partnerId) }, { projection: { _id: 1 } }).toArray();
    const allowed = new Set([partnerId, ...eventRows.map((event) => event._id?.toString?.() ?? '').filter(Boolean)]);
    const dependencies = await findAssetUsages(db, kind, itemId, urls, { ownerIds: allowed });
    if (dependencies.total || dependencies.truncated) throw apiError(`This ${kind === 'images' ? 'image' : kind === 'frames' ? 'frame' : 'logo'} is still used in this partner or its events. Open each listed place, remove or replace the use, then return and retry deletion.`, 409, { kind, assetId: itemId, usages: dependencies.usages, total: dependencies.total, truncated: dependencies.truncated });
  }
  const result = await deleteLibraryUpload(db, kind, itemId, { scope: 'partner', partnerId: String(partner.partnerId) });
  // The reason names the kind ("Frame not found", "Image not found").
  if (!result.ok) {
    const eventRows = result.status === 409 ? await db.collection(COLLECTIONS.EVENTS).find({ partnerId: String(partner.partnerId) }, { projection: { _id: 1 } }).toArray() : [];
    const allowed = new Set([partnerId, ...eventRows.map((event) => event._id?.toString?.() ?? '').filter(Boolean)]);
    const details = result.status === 409 ? await findAssetUsages(db, kind, itemId, [], { ownerIds: allowed }) : null;
    throw apiError(result.reason, result.status, details ? { kind, assetId: itemId, usages: details.usages, total: details.total, truncated: details.truncated } : undefined);
  }
  return apiSuccess({ deleted: itemId });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { partnerId, itemId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind) throw apiBadRequest('kind must be frames, logos or images');
  if (body.name === undefined && body.messageArea === undefined && body.isActive === undefined) throw apiBadRequest('Nothing to change: send name, messageArea or isActive');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await updateLibraryUpload(db, kind, itemId, { scope: 'partner', partnerId: String(partner.partnerId) }, { name: body.name, messageArea: body.messageArea, isActive: body.isActive }, generateTimestamp());
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : kind === 'logos' ? 'Logo' : 'Image') : apiError(result.reason, result.status);
  if (kind === 'frames' && (body.messageArea !== undefined || body.isActive !== undefined)) afterResponse(() => regenerateEventsUsingFrame(db, itemId).then((done) => { if (done.failed.length) console.error('Frame images could not be redrawn', done.failed); }));
  return apiSuccess({ item: itemView(kind, result.item) });
});
