/**
 * Admin Users Page
 * 
 * Comprehensive user management interface.
 * 
 * Features:
 * - Lists all user types: Administrators, Real users, Pseudo users, Anonymous users
 * - Role management (user ↔ admin)
 * - Status management (active ↔ inactive)
 * - Merge pseudo users with real users
 * - Visual indicators for user status and role
 * 
 * User Types:
 * - Administrator: SSO authenticated with admin role
 * - Real: SSO authenticated with user role
 * - Pseudo: Event guests who provided name/email
 * - Anonymous: Session-based, no personal info
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import Link from 'next/link';
import UserManagementActions from '@/components/admin/UserManagementActions';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';
import { redirect } from 'next/navigation';

// Force dynamic rendering (uses cookies for session)
export const dynamic = 'force-dynamic';

/**
 * Sanitize username for URL
 * Replaces spaces and special characters with underscores
 */
function sanitizeUsername(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
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
  submissions: Array<{
    _id: unknown;
    imageUrl: string;
    createdAt: string;
  }>;
  ssoIdForPermission?: string | null;
  accountDisabledMirror?: boolean;
  partnerAccess?: Array<{
    accessId: string;
    partnerId: string;
    partnerName: string;
    appKey: 'events' | 'gym';
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
  let error: unknown = null;
  let currentUserEmail = '';
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim().toLowerCase() : '';

  try {
    // Get current session for admin email
    const session = gateSession;
    currentUserEmail = session?.user.email || '';
    
    // Fetch camera database submissions
    const db = await connectToDatabase();
    const submissions = await db
      .collection('submissions')
      .find({ 
        $or: [
          { isArchived: false },
          { isArchived: { $exists: false } }
        ]
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Group submissions by user identifier (SSO profile loaded over HTTP below)
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
        !hasUserInfo &&
        (submission.userId === 'anonymous' || submission.userEmail === 'anonymous@event');

      if (!userMap.has(identifier)) {
        const isPseudoUser = hasUserInfo && !isMergedPseudo;
        const isRealOrAdmin = !hasUserInfo && !isAnonymous;
        const isMergedUser = isMergedPseudo;

        let ssoIdForPermission: string | null = null;
        if (isMergedUser && submission.userInfo?.mergedWith) {
          ssoIdForPermission = submission.userInfo.mergedWith;
        } else if (
          isRealOrAdmin &&
          submission.userId &&
          submission.userId !== 'anonymous'
        ) {
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
            ? submission.userInfo.name
            : isAnonymous
              ? 'Anonymous User'
              : submission.userName || 'Unknown',
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
          u.type =
            r === 'admin' || r === 'superadmin' ? 'administrator' : 'real';
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

    const partnerAccessRows = await db
      .collection(COLLECTIONS.PARTNER_USER_ACCESS)
      .find({})
      .toArray();
    const partnerAccessByEmail = new Map<string, AdminUserListItem['partnerAccess']>();
    for (const row of partnerAccessRows) {
      const email = typeof row.userEmail === 'string' ? row.userEmail.trim().toLowerCase() : '';
      if (!email) continue;
      const bucket = partnerAccessByEmail.get(email) || [];
      bucket.push({
        accessId: String(row.accessId ?? ''),
        partnerId: String(row.partnerId ?? ''),
        partnerName: String(row.partnerName ?? ''),
        appKey: row.appKey === 'gym' ? 'gym' : 'events',
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
    error = err;
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

  const administrators = filteredUsers.filter((user) => user.type === 'administrator');
  const accessManagedUsers = filteredUsers.filter((user) => user.type === 'administrator' || user.type === 'real');
  const guestUsers = filteredUsers.filter((user) => user.type === 'pseudo');
  const anonymousUsers = filteredUsers.filter((user) => user.type === 'anonymous');
  const activeUsers = filteredUsers.filter((user) => user.isActive !== false);
  const representedSubmissions = filteredUsers.reduce((sum, user) => sum + user.submissions.length, 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Global Users</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Global access management plus participation records derived from Camera submissions.
        </p>
      </div>

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:flex-row">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search name, email, partner, or event"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <div className="flex gap-3">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 transition-colors">
            Search
          </button>
          {search ? (
            <Link href="/admin/users" className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && filteredUsers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No users yet</h3>
          <p className="text-gray-600 dark:text-gray-400">Waiting for first submissions</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Global access-managed accounts</div>
              <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{accessManagedUsers.length}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{administrators.length} admin-level accounts</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Guest identities</div>
              <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{guestUsers.length}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Submission-only users collected from events</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Anonymous participants</div>
              <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{anonymousUsers.length}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Session-based users without profile details</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Represented submissions</div>
              <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{representedSubmissions}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{activeUsers.length} active identities in this directory</div>
            </div>
          </div>

          <AuthorizationMatrix
            description="Use this matrix when deciding whether a user belongs in global SSO admin management or in partner-scoped Camera assignments."
          />

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            This page manages global Camera access today. Partner-level permissions are not modeled separately yet, so guest and participation records below are derived from submissions rather than a dedicated partner access table.
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Directory and Participation History</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Operators can manage global roles and status here while still seeing how each identity shows up in event participation.
              </p>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.map((user, index: number) => {
              const profileHref = `/users/${sanitizeUsername(user.name || 'Anonymous')}`;
              const emailDisplay = user.isAnonymous ? 'anonymous@event.com' : (user.email || 'unknown');
              const registeredAt = new Date(user.collectedAt).toLocaleString();
              const photosCount = user.submissions.length;
              const lastEvent = user.eventName || 'Unknown Event';
              const accessLabel =
                user.type === 'administrator'
                  ? 'Global Camera administrator'
                  : user.type === 'real'
                    ? 'Global Camera user'
                    : user.type === 'pseudo'
                      ? 'Submission-only guest identity'
                      : 'Anonymous participation identity';

              return (
                <div key={`${user.email}-${index}`} className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Link href={profileHref} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">
                          {user.name || 'Anonymous'}
                        </Link>
                        
                        {/* Status Badges */}
                        {user.isAnonymous && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">Anonymous</span>
                        )}
                        {user.type === 'administrator' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">Admin</span>
                        )}
                        {/* Only show Pseudo badge if NOT merged */}
                        {user.type === 'pseudo' && !user.mergedWith && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">Pseudo</span>
                        )}
                        {!user.isActive && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">Inactive</span>
                        )}
                        {/* Show Merged badge but don't show Pseudo at the same time */}
                        {user.mergedWith && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">Merged</span>
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{accessLabel}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📧 {emailDisplay}</div>
                        {user.partnerAccess && user.partnerAccess.length > 0 && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            🔐 Partner access:{' '}
                            {user.partnerAccess.slice(0, 2).map((assignment, idx) => (
                              <span key={assignment.accessId}>
                                {idx > 0 ? ', ' : ''}
                                <Link
                                  href={`/admin/partners?search=${encodeURIComponent(assignment.partnerName)}`}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                >
                                  {assignment.partnerName}
                                </Link>{' '}
                                ({assignment.appKey}/{assignment.role})
                              </span>
                            ))}
                            {user.partnerAccess.length > 2 ? ` +${user.partnerAccess.length - 2} more` : ''}
                          </div>
                        )}
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📸 {photosCount} photos</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">🎉 Last Event: {lastEvent}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📅 Registered: {registeredAt}</div>
                      </div>
                    </div>
                    
                    {/* Management Actions */}
                    <div className="lg:w-80">
                      <UserManagementActions 
                        user={{
                          email: user.email,
                          name: user.name,
                          type: user.type,
                          role: user.role,
                          isActive: user.isActive,
                          mergedWith: user.mergedWith,
                        }}
                        currentUserEmail={currentUserEmail}
                      />
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
