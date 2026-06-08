import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import { apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api/responses';
import { COLLECTIONS, type PartnerAccessRole, type PartnerAppKey } from '@/lib/db/schemas';
import { getPartnerAccessForIdentity, listPartnerUserAccess } from '@/lib/partners/access';

const ROLE_RANK: Record<PartnerAccessRole, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
};

export function isGlobalAdminSession(session: Session | null | undefined): boolean {
  return session?.appRole === 'admin' || session?.appRole === 'superadmin';
}

export async function listSessionPartnerAssignments(db: Db, session: Session) {
  const email = session.user.email?.trim().toLowerCase();
  const rowsByEmail = email
    ? await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).find({ userEmail: email, isActive: true }).toArray()
    : [];
  const rowsByUserId = session.user.id
    ? await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).find({ userId: session.user.id, isActive: true }).toArray()
    : [];
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...rowsByEmail, ...rowsByUserId]) {
    const accessId = typeof row.accessId === 'string' ? row.accessId : '';
    if (accessId) merged.set(accessId, row as Record<string, unknown>);
  }
  return Array.from(merged.values()) as Array<{
    accessId: string;
    partnerId: string;
    partnerName: string;
    userId?: string | null;
    userEmail: string;
    appKey: PartnerAppKey;
    role: PartnerAccessRole;
    isActive: boolean;
  }>;
}

export async function hasAnyPartnerAccess(
  db: Db,
  session: Session,
  appKey?: PartnerAppKey
): Promise<boolean> {
  const assignments = await listSessionPartnerAssignments(db, session);
  return assignments.some((assignment) => assignment.isActive && (!appKey || assignment.appKey === appKey));
}

export async function listAccessiblePartnerIds(
  db: Db,
  session: Session,
  appKey?: PartnerAppKey
): Promise<string[]> {
  if (isGlobalAdminSession(session)) {
    const partners = await db.collection(COLLECTIONS.PARTNERS).find({}, { projection: { partnerId: 1 } }).toArray();
    return partners
      .map((partner) => (typeof partner.partnerId === 'string' ? partner.partnerId : ''))
      .filter(Boolean);
  }

  const assignments = await listSessionPartnerAssignments(db, session);
  return Array.from(
    new Set(
      assignments
        .filter((assignment) => assignment.isActive && (!appKey || assignment.appKey === appKey))
        .map((assignment) => assignment.partnerId)
        .filter(Boolean)
    )
  );
}

export async function getPartnerScopedAccessForPartner(
  db: Db,
  session: Session,
  partnerId: string,
  appKey?: PartnerAppKey,
  minRole: PartnerAccessRole = 'viewer'
): Promise<{ allowed: boolean; role: PartnerAccessRole | null }> {
  if (isGlobalAdminSession(session)) {
    return { allowed: true, role: 'admin' };
  }
  const assignments = await listPartnerUserAccess(db, partnerId);
  const matchingAssignments = appKey
    ? assignments.filter((assignment) => assignment.appKey === appKey)
    : assignments;
  const identity = { userId: session.user.id, email: session.user.email };
  const assignment = appKey
    ? getPartnerAccessForIdentity(matchingAssignments, identity, appKey)
    : matchingAssignments.find((row) => {
        const sameUserId = row.userId && session.user.id && row.userId === session.user.id;
        const sameEmail = row.userEmail.trim().toLowerCase() === session.user.email.trim().toLowerCase();
        return row.isActive && (sameUserId || sameEmail);
      }) ?? null;
  if (!assignment) {
    return { allowed: false, role: null };
  }
  return {
    allowed: ROLE_RANK[assignment.role] >= ROLE_RANK[minRole],
    role: assignment.role,
  };
}

export async function getPartnerScopedAccessForEvent(
  db: Db,
  eventMongoId: string,
  session: Session,
  minRole: PartnerAccessRole = 'viewer'
): Promise<{ allowed: boolean; role: PartnerAccessRole | null; partnerId: string | null }> {
  if (!ObjectId.isValid(eventMongoId)) {
    return { allowed: false, role: null, partnerId: null };
  }
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  const partnerId = typeof event?.partnerId === 'string' ? event.partnerId : null;
  if (!partnerId) {
    return { allowed: false, role: null, partnerId: null };
  }
  const access = await getPartnerScopedAccessForPartner(db, session, partnerId, 'events', minRole);
  return { ...access, partnerId };
}

export async function getPartnerScopedAccessForEventUuid(
  db: Db,
  eventUuid: string,
  session: Session,
  minRole: PartnerAccessRole = 'viewer'
): Promise<{ allowed: boolean; role: PartnerAccessRole | null; partnerId: string | null }> {
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: eventUuid });
  const partnerId = typeof event?.partnerId === 'string' ? event.partnerId : null;
  if (!partnerId) {
    return { allowed: false, role: null, partnerId: null };
  }
  const access = await getPartnerScopedAccessForPartner(db, session, partnerId, 'events', minRole);
  return { ...access, partnerId };
}

export type PartnerAccessContext = {
  role: PartnerAccessRole | null;
  partnerId: string | null;
};

/**
 * Throws 403 when the session lacks partner-scoped Events access for an event Mongo _id.
 */
export async function assertPartnerEventAccess(
  db: Db,
  session: Session,
  eventMongoId: string,
  minRole: PartnerAccessRole = 'viewer'
): Promise<PartnerAccessContext> {
  const access = await getPartnerScopedAccessForEvent(db, eventMongoId, session, minRole);
  if (!access.allowed) {
    throw apiForbidden(`Partner-level Events ${minRole} access is required`);
  }
  return { role: access.role, partnerId: access.partnerId };
}

/**
 * Global admins bypass; partner-scoped users must meet minRole for the event.
 */
export async function assertGlobalAdminOrPartnerEventAccess(
  db: Db,
  session: Session,
  eventMongoId: string,
  minRole: PartnerAccessRole = 'manager'
): Promise<PartnerAccessContext> {
  if (isGlobalAdminSession(session)) {
    const access = await getPartnerScopedAccessForEvent(db, eventMongoId, session, 'viewer');
    return { role: 'admin', partnerId: access.partnerId };
  }
  return assertPartnerEventAccess(db, session, eventMongoId, minRole);
}

/**
 * Throws 403 when the session cannot access a partner workspace (any active assignment).
 */
export async function assertPartnerWorkspaceAccess(
  db: Db,
  session: Session,
  partnerUuid: string,
  minRole: PartnerAccessRole = 'viewer'
): Promise<PartnerAccessContext> {
  if (isGlobalAdminSession(session)) {
    return { role: 'admin', partnerId: partnerUuid };
  }
  const access = await getPartnerScopedAccessForPartner(db, session, partnerUuid, undefined, minRole);
  if (!access.allowed) {
    throw apiForbidden(`Partner-level ${minRole} access is required`);
  }
  return { role: access.role, partnerId: partnerUuid };
}

/**
 * Resolve a partner by Mongo _id and enforce workspace access.
 */
export async function assertPartnerMongoWorkspaceAccess(
  db: Db,
  session: Session,
  partnerMongoId: string,
  minRole: PartnerAccessRole = 'viewer'
): Promise<{ partner: Record<string, unknown>; role: PartnerAccessRole | null; partnerId: string }> {
  if (!ObjectId.isValid(partnerMongoId)) {
    throw apiBadRequest('Invalid partner ID');
  }
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerMongoId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }
  const partnerId = String(partner.partnerId);
  const access = await assertPartnerWorkspaceAccess(db, session, partnerId, minRole);
  return { partner: partner as Record<string, unknown>, role: access.role, partnerId };
}

export async function getAdminNavigationAccess(db: Db, session: Session) {
  if (isGlobalAdminSession(session)) {
    return {
      isGlobalAdmin: true,
      hasAnyPartnerAccess: true,
      hasEventsAccess: true,
    };
  }
  const assignments = await listSessionPartnerAssignments(db, session);
  return {
    isGlobalAdmin: false,
    hasAnyPartnerAccess: assignments.length > 0,
    hasEventsAccess: assignments.some((assignment) => assignment.appKey === 'events' && assignment.isActive),
  };
}
