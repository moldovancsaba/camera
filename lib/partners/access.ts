import type { Db } from 'mongodb';
import { COLLECTIONS, generateId, generateTimestamp, type NewPartnerUserAccess, type PartnerAccessRole, type PartnerAppKey, type PartnerUserAccess } from '@/lib/db/schemas';
import { resolveSsoUserIdByEmail } from '@/lib/sso/submission-account';

export interface PartnerAccessUpsertInput {
  partnerId: string;
  partnerName: string;
  userEmail: string;
  userName?: string | null;
  userId?: string | null;
  appKey: PartnerAppKey;
  role: PartnerAccessRole;
  isActive?: boolean;
  createdBy: string;
}

export interface PartnerAccessSummary {
  assignments: PartnerUserAccess[];
  countsByApp: Record<PartnerAppKey, number>;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveUserNameByEmail(db: Db, email: string): Promise<string | null> {
  const row = await db.collection(COLLECTIONS.SUBMISSIONS).findOne(
    {
      $or: [
        { userEmail: email },
        { 'userInfo.email': email },
      ],
    },
    {
      projection: {
        userName: 1,
        'userInfo.name': 1,
      },
      sort: { createdAt: -1 },
    }
  );
  const userInfoName = row?.userInfo && typeof row.userInfo === 'object' ? (row.userInfo as { name?: unknown }).name : null;
  if (typeof userInfoName === 'string' && userInfoName.trim()) return userInfoName.trim();
  return typeof row?.userName === 'string' && row.userName.trim() ? row.userName.trim() : null;
}

export async function listPartnerUserAccess(
  db: Db,
  partnerId: string
): Promise<PartnerUserAccess[]> {
  return await db
    .collection(COLLECTIONS.PARTNER_USER_ACCESS)
    .find({ partnerId })
    .sort({ isActive: -1, userName: 1, userEmail: 1, appKey: 1 })
    .toArray() as unknown as PartnerUserAccess[];
}

export async function getPartnerAccessSummary(
  db: Db,
  partnerId: string
): Promise<PartnerAccessSummary> {
  const assignments = await listPartnerUserAccess(db, partnerId);
  const countsByApp: Record<PartnerAppKey, number> = { events: 0 };
  for (const assignment of assignments) {
    countsByApp[assignment.appKey] += 1;
  }
  return { assignments, countsByApp };
}

export async function upsertPartnerUserAccess(
  db: Db,
  input: PartnerAccessUpsertInput
): Promise<PartnerUserAccess> {
  const now = generateTimestamp();
  const userEmail = normalizeEmail(input.userEmail);
  const existing = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).findOne({
    partnerId: input.partnerId,
    userEmail,
    appKey: input.appKey,
  });

  const userId =
    typeof input.userId === 'string' && input.userId.trim()
      ? input.userId.trim()
      : await resolveSsoUserIdByEmail(db, userEmail);
  const userName =
    typeof input.userName === 'string' && input.userName.trim()
      ? input.userName.trim()
      : await resolveUserNameByEmail(db, userEmail);

  if (existing) {
    await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).updateOne(
      { _id: existing._id },
      {
        $set: {
          partnerName: input.partnerName,
          userId: userId ?? null,
          userName: userName ?? null,
          role: input.role,
          isActive: input.isActive !== false,
          updatedAt: now,
        },
      }
    );
    const updated = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).findOne({ _id: existing._id });
    return updated as unknown as PartnerUserAccess;
  }

  const doc: NewPartnerUserAccess = {
    accessId: generateId(),
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    userId: userId ?? null,
    userEmail,
    userName: userName ?? null,
    appKey: input.appKey,
    role: input.role,
    isActive: input.isActive !== false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).insertOne(doc);
  return {
    ...doc,
    _id: result.insertedId,
  };
}

export async function updatePartnerUserAccess(
  db: Db,
  accessId: string,
  updates: Partial<Pick<PartnerUserAccess, 'role' | 'isActive' | 'appKey' | 'userName'>>
): Promise<PartnerUserAccess | null> {
  const patch: Partial<PartnerUserAccess> & { updatedAt: string } = {
    updatedAt: generateTimestamp(),
  };
  if (updates.role) patch.role = updates.role;
  if (typeof updates.isActive === 'boolean') patch.isActive = updates.isActive;
  if (updates.appKey) patch.appKey = updates.appKey;
  if (typeof updates.userName === 'string') patch.userName = updates.userName.trim() || null;
  await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).updateOne({ accessId }, { $set: patch });
  const updated = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).findOne({ accessId });
  return updated ? (updated as unknown as PartnerUserAccess) : null;
}

export async function deletePartnerUserAccess(
  db: Db,
  accessId: string
): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).deleteOne({ accessId });
  return result.deletedCount > 0;
}

export async function listUserPartnerAccessByEmail(
  db: Db,
  email: string
): Promise<PartnerUserAccess[]> {
  return await db
    .collection(COLLECTIONS.PARTNER_USER_ACCESS)
    .find({ userEmail: normalizeEmail(email) })
    .sort({ partnerName: 1, appKey: 1 })
    .toArray() as unknown as PartnerUserAccess[];
}

export function getPartnerAccessForIdentity(
  assignments: PartnerUserAccess[],
  identity: { userId?: string | null; email?: string | null },
  appKey: PartnerAppKey
): PartnerUserAccess | null {
  const email = identity.email ? normalizeEmail(identity.email) : null;
  const userId = identity.userId?.trim() || null;
  return (
    assignments.find((assignment) =>
      assignment.appKey === appKey &&
      assignment.isActive &&
      ((userId && assignment.userId === userId) || (email && normalizeEmail(assignment.userEmail) === email))
    ) ?? null
  );
}
