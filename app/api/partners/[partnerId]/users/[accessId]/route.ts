import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type PartnerAccessRole, type PartnerAppKey } from '@/lib/db/schemas';
import { apiBadRequest, apiNoContent, apiNotFound, apiSuccess, requireAdmin, withErrorHandler } from '@/lib/api';
import { deletePartnerUserAccess, updatePartnerUserAccess } from '@/lib/partners/access';

function parseAppKey(value: unknown): PartnerAppKey | null {
  return value === 'events' ? 'events' : null;
}

function parseRole(value: unknown): PartnerAccessRole | null {
  return value === 'viewer' || value === 'manager' || value === 'admin' ? value : null;
}

export const PATCH = withErrorHandler(async (
  request,
  context: { params: Promise<{ partnerId: string; accessId: string }> }
) => {
  await requireAdmin();
  const { partnerId, accessId } = await context.params;
  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID.');
  }

  const body = await request.json();
  const updates: {
    role?: PartnerAccessRole;
    isActive?: boolean;
    appKey?: PartnerAppKey;
    userName?: string;
  } = {};

  if (body.role !== undefined) {
    const role = parseRole(body.role);
    if (!role) throw apiBadRequest('role must be "viewer", "manager", or "admin".');
    updates.role = role;
  }
  if (body.appKey !== undefined) {
    const appKey = parseAppKey(body.appKey);
    if (!appKey) throw apiBadRequest('appKey must be "events".');
    updates.appKey = appKey;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw apiBadRequest('isActive must be boolean.');
    updates.isActive = body.isActive;
  }
  if (body.userName !== undefined) {
    updates.userName = String(body.userName);
  }
  if (Object.keys(updates).length === 0) {
    throw apiBadRequest('No updates supplied.');
  }

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }

  const updated = await updatePartnerUserAccess(db, accessId, updates);
  if (!updated) {
    throw apiNotFound('Partner access assignment');
  }

  return apiSuccess({ assignment: updated });
});

export const DELETE = withErrorHandler(async (
  request,
  context: { params: Promise<{ partnerId: string; accessId: string }> }
) => {
  await requireAdmin();
  const { partnerId, accessId } = await context.params;
  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID.');
  }

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }

  const removed = await deletePartnerUserAccess(db, accessId);
  if (!removed) {
    throw apiNotFound('Partner access assignment');
  }

  return apiNoContent();
});
