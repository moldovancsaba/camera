/**
 * Admin Users Page
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';
import { redirect } from 'next/navigation';
import UsersInventoryView, { type SerializedAdminUserRow } from '@/components/gds/UsersInventoryView';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

function sanitizeUsername(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(userName: string | undefined | null, isAnonymous: boolean): string {
  const normalized = typeof userName === 'string' ? userName.trim() : '';
  if (isAnonymous) {
    return 'Anonymous User';
  }
  return normalized && !isLegacyGuestName(normalized) ? normalized : 'Unknown';
}

interface AdminUserListItem {
  email: string;
  name: string;
  type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
  role?: string;
  isActive?: boolean;
  isAnonymous?: boolean;
  mergedWith?: string;
  collectedAt: string;
  eventId?: string;
  eventName?: string;
  submissions: Array<{ _id: unknown; imageUrl: string; createdAt: string }>;
  ssoIdForPermission?: string | null;
  accountDisabledMirror?: boolean;
  partnerAccess?: Array<{
    accessId: string;
    partnerId: string;
    partnerName: string;
    appKey: 'events';
    role: 'viewer' | 'manager' | 'admin';
    isActive: boolean;
  }>;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const gateSession = await getSession();
  if (!isGlobalAdminSession(gateSession)) {
    redirect('/admin/partners');
  }

  let users: AdminUserListItem[] = [];
  let dbError = null;
  let currentUserEmail = '';
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim().toLowerCase() : '';

  try {
    const session = gateSession;
    currentUserEmail = session?.user.email || '';

    const db = await connectToDatabase();
    const submissions = await db
      .collection('submissions')
      .find({
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    const userMap = new Map<string, AdminUserListItem>();

    for (const submission of submissions) {
      const hasUserInfo = submission.userInfo?.email && submission.userInfo?.name;
      const isMergedPseudo = hasUserInfo && submission.userInfo?.mergedWith;

      const identifier = isMergedPseudo
        ? submission.userInfo.mergedWith
        : hasUserInfo
          ? submission.userInfo.email
          : submission.userId || submission.userEmail;

      const isAnonymous =
        !hasUserInfo && (submission.userId === 'anonymous' || submission.userEmail === 'anonymous@event');

      if (!userMap.has(identifier)) {
        const isPseudoUser = hasUserInfo && !isMergedPseudo;
        const isRealOrAdmin = !hasUserInfo && !isAnonymous;
        const isMergedUser = isMergedPseudo;

        let ssoIdForPermission: string | null = null;
        if (isMergedUser && submission.userInfo?.mergedWith) {
          ssoIdForPermission = submission.userInfo.mergedWith;
        } else if (isRealOrAdmin && submission.userId && submission.userId !== 'anonymous') {
          ssoIdForPermission = submission.userId;
        }

        let userType: AdminUserListItem['type'] = 'pseudo';
        const role = 'user';
        let isActive = true;

        if (isAnonymous) {
          userType = 'anonymous';
        } else if (isMergedUser) {
          userType = 'real';
        } else if (isRealOrAdmin) {
          userType = 'real';
        } else if (isPseudoUser) {
          isActive = submission.userInfo?.isActive !== false;
          userType = 'pseudo';
        }

        const accountDisabledMirror = submission.cameraAccountDisabled === true;

        userMap.set(identifier, {
          email: hasUserInfo ? submission.userInfo.email : submission.userEmail,
          name: hasUserInfo
            ? resolveDisplayName(submission.userInfo.name, isAnonymous)
            : resolveDisplayName(submission.userName, isAnonymous),
          isAnonymous,
          type: userType,
          role,
          isActive,
          mergedWith: submission.userInfo?.mergedWith,
          collectedAt: submission.userInfo?.collectedAt || submission.createdAt,
          eventId: submission.eventId,
          eventName: submission.eventName || 'Unknown Event',
          submissions: [],
          ssoIdForPermission,
          accountDisabledMirror,
        });
      } else {
        const ent = userMap.get(identifier);
        if (ent && submission.cameraAccountDisabled) {
          ent.accountDisabledMirror = true;
        }
      }

      userMap.get(identifier)?.submissions.push({
        _id: submission._id,
        imageUrl: submission.imageUrl,
        createdAt: submission.createdAt,
      });
    }

    const adminSession = await getSession();
    if (adminSession?.accessToken) {
      const permCache = new Map<string, Awaited<ReturnType<typeof getAppPermission>>>();

      for (const u of userMap.values()) {
        if (!u.ssoIdForPermission) continue;

        try {
          let perm = permCache.get(u.ssoIdForPermission);
          if (!perm) {
            perm = await getAppPermission(u.ssoIdForPermission, adminSession.accessToken);
            permCache.set(u.ssoIdForPermission, perm);
          }

          const r = perm.role;
          u.role = r === 'superadmin' ? 'admin' : r;
          u.type = r === 'admin' || r === 'superadmin' ? 'administrator' : 'real';
          const approved = hasAppAccess(perm);
          u.isActive = approved && !u.accountDisabledMirror;
        } catch (e) {
          console.warn('[admin/users] getAppPermission failed for', u.ssoIdForPermission, e);
          u.isActive = !u.accountDisabledMirror;
        }
      }
    } else {
      for (const u of userMap.values()) {
        if (u.type === 'real' || u.type === 'administrator') {
          u.isActive = !u.accountDisabledMirror;
        }
      }
    }

    for (const u of userMap.values()) {
      if (u.type === 'pseudo') {
        u.isActive = u.isActive !== false;
      }
      if (u.type === 'anonymous') {
        u.isActive = true;
      }
    }

    const partnerAccessRows = await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).find({}).toArray();
    const partnerAccessByEmail = new Map<string, AdminUserListItem['partnerAccess']>();
    for (const row of partnerAccessRows) {
      const email = typeof row.userEmail === 'string' ? row.userEmail.trim().toLowerCase() : '';
      if (!email) continue;
      const bucket = partnerAccessByEmail.get(email) || [];
      bucket.push({
        accessId: String(row.accessId ?? ''),
        partnerId: String(row.partnerId ?? ''),
        partnerName: String(row.partnerName ?? ''),
        appKey: 'events',
        role: row.role === 'viewer' || row.role === 'manager' || row.role === 'admin' ? row.role : 'viewer',
        isActive: row.isActive !== false,
      });
      partnerAccessByEmail.set(email, bucket);
    }

    users = Array.from(userMap.values()).map((user) => ({
      ...user,
      partnerAccess: user.email ? partnerAccessByEmail.get(user.email.trim().toLowerCase()) || [] : [],
    }));
  } catch (err) {
    console.error('Error fetching users:', err);
    dbError = serializeMongoError(err);
  }

  const filteredUsers = search
    ? users.filter((user) =>
        [
          user.name,
          user.email,
          user.eventName,
          ...(user.partnerAccess?.map((assignment) => assignment.partnerName) || []),
        ]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(search))
      )
    : users;

  const serializedUsers: SerializedAdminUserRow[] = filteredUsers.map((user) => ({
    email: user.email,
    name: user.name,
    type: user.type,
    role: user.role,
    isActive: user.isActive,
    isAnonymous: user.isAnonymous,
    mergedWith: user.mergedWith,
    collectedAtLabel: new Date(user.collectedAt).toLocaleString(),
    eventName: user.eventName ?? null,
    photosCount: user.submissions.length,
    profileHref: `/users/${sanitizeUsername(user.name || 'Anonymous')}`,
    emailDisplay: user.isAnonymous ? 'anonymous@event.com' : user.email || 'unknown',
    accessLabel:
      user.type === 'administrator'
        ? 'Global Camera administrator'
        : user.type === 'real'
          ? 'Global Camera user'
          : user.type === 'pseudo'
            ? 'Submission-only guest identity'
            : 'Anonymous participation identity',
    partnerAccess: user.partnerAccess || [],
  }));

  const accessManagedUsers = filteredUsers.filter((user) => user.type === 'administrator' || user.type === 'real');
  const guestUsers = filteredUsers.filter((user) => user.type === 'pseudo');
  const anonymousUsers = filteredUsers.filter((user) => user.type === 'anonymous');
  const representedSubmissions = filteredUsers.reduce((sum, user) => sum + user.submissions.length, 0);

  return (
    <UsersInventoryView
      users={serializedUsers}
      search={search}
      currentUserEmail={currentUserEmail}
      stats={{
        accessManaged: accessManagedUsers.length,
        guests: guestUsers.length,
        anonymous: anonymousUsers.length,
        representedSubmissions,
      }}
      dbError={dbError}
    />
  );
}
