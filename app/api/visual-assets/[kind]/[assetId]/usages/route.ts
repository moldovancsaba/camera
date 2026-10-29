import { NextRequest } from 'next/server';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { KIND_META, parseKind } from '@/lib/library/kinds';
import { findAssetUsages } from '@/lib/library/usages';

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ kind: string; assetId: string }> }) => {
  const session = await requireAuth();
  const { kind: rawKind, assetId } = await context.params;
  const kind = parseKind(rawKind);
  if (!kind) throw apiBadRequest('kind must be frames, logos or images');

  const db = await connectToDatabase();
  const item = await db.collection(KIND_META[kind].collection).findOne({ [KIND_META[kind].idField]: assetId });
  if (!item) throw apiNotFound(KIND_META[kind].noun);

  const scope = item.scope === 'partner' ? 'partner' : item.scope === 'event' ? 'event' : 'global';
  let allowedOwnerIds: Set<string> | null = null;
  if (scope === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  } else if (scope === 'partner') {
    if (typeof item.partnerId !== 'string' || !item.partnerId) throw apiNotFound('Partner');
    const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: item.partnerId });
    if (!partner?._id) throw apiNotFound('Partner');
    const access = await assertPartnerMongoWorkspaceAccess(db, session, partner._id.toString(), 'manager');
    if (access.partnerId !== item.partnerId) throw apiForbidden('This asset belongs to a different partner');
    const events = await db.collection(COLLECTIONS.EVENTS).find({ partnerId: item.partnerId }, { projection: { _id: 1 } }).toArray();
    allowedOwnerIds = new Set([partner._id.toString(), ...events.map((event) => event._id?.toString?.() ?? '').filter(Boolean)]);
  } else {
    if (typeof item.eventId !== 'string' || !item.eventId) throw apiNotFound('Event');
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: item.eventId }, { projection: { _id: 1 } });
    if (!event?._id) throw apiNotFound('Event');
    const access = await getPartnerScopedAccessForEvent(db, event._id.toString(), session, 'manager');
    if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
    allowedOwnerIds = new Set([event._id.toString()]);
  }

  const imageUrls = [item.imageUrl, item.thumbnailUrl].filter((value): value is string => typeof value === 'string' && Boolean(value));
  const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? 0);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  const result = await findAssetUsages(db, kind, assetId, imageUrls, { offset, ownerIds: allowedOwnerIds ?? undefined });
  let copySourceUrl: string | null = null;
  if (typeof item.imageUrl === 'string') {
    try {
      const url = new URL(item.imageUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) copySourceUrl = url.toString();
    } catch {
      // A malformed stored URL must not become a navigation target.
    }
  }
  return apiSuccess({ ...result, copySourceUrl, assetName: typeof item.name === 'string' ? item.name : KIND_META[kind].noun });
});
