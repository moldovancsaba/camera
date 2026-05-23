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
import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconPhotoScan, IconSearch, IconUser, IconUsers, IconUserShield } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import StatusBadge from '@/components/gds/StatusBadge';

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

  const accessManagedUsers = filteredUsers.filter((user) => user.type === 'administrator' || user.type === 'real');
  const guestUsers = filteredUsers.filter((user) => user.type === 'pseudo');
  const anonymousUsers = filteredUsers.filter((user) => user.type === 'anonymous');
  const representedSubmissions = filteredUsers.reduce((sum, user) => sum + user.submissions.length, 0);

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Global Users"
        description="Global access management plus participation records derived from Camera submissions."
        status="Global Admin"
      />

      <StatsStrip
        items={[
          {
            label: 'Access-managed accounts',
            value: accessManagedUsers.length,
            icon: <IconUserShield size={20} />,
          },
          {
            label: 'Guest identities',
            value: guestUsers.length,
            icon: <IconUsers size={20} />,
          },
          {
            label: 'Anonymous participants',
            value: anonymousUsers.length,
            icon: <IconUser size={20} />,
          },
          {
            label: 'Represented submissions',
            value: representedSubmissions,
            icon: <IconPhotoScan size={20} />,
          },
        ]}
      />

      <Card>
        <form>
          <Group align="end">
            <TextInput
              name="search"
              defaultValue={search}
              label="Search"
              placeholder="Search by name, email, partner, or event"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Link href="/admin/users" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && filteredUsers.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>👥</Text>
            <Text fw={700} fz="lg">
              No users yet
            </Text>
            <Text c="dimmed">Waiting for first submissions</Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="lg">

          <AuthorizationMatrix
            description="Use this matrix when deciding whether a user belongs in global SSO admin management or in partner-scoped Camera assignments."
          />

          <Card
            style={{
              background: 'rgba(251, 191, 36, 0.12)',
              borderColor: 'rgba(245, 158, 11, 0.35)',
            }}
          >
            <Text size="sm" c="dark.8">
              This page manages global Camera access today. Partner-level permissions are not modeled separately yet, so guest and participation records below are derived from submissions rather than a dedicated partner access table.
            </Text>
          </Card>

          <Card p={0} style={{ overflow: 'hidden' }}>
            <div style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', padding: '1rem 1.5rem' }}>
              <Text fw={700} fz="lg" c="dark.8">
                Directory and Participation History
              </Text>
              <Text mt={4} size="sm" c="dimmed">
                Operators can manage global roles and status here while still seeing how each identity shows up in event participation.
              </Text>
            </div>
            <div style={{ borderTop: 0 }}>
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
                <div
                  key={`${user.email}-${index}`}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--mantine-color-gray-2)',
                  }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Link href={profileHref} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">
                          {user.name || 'Anonymous'}
                        </Link>
                        
                        {/* Status Badges */}
                        {user.isAnonymous && (
                          <StatusBadge tone="info" label="Anonymous" />
                        )}
                        {user.type === 'administrator' && (
                          <StatusBadge tone="info" label="Admin" />
                        )}
                        {/* Only show Pseudo badge if NOT merged */}
                        {user.type === 'pseudo' && !user.mergedWith && (
                          <StatusBadge tone="info" label="Pseudo" />
                        )}
                        {!user.isActive && (
                          <StatusBadge tone="inactive" />
                        )}
                        {/* Show Merged badge but don't show Pseudo at the same time */}
                        {user.mergedWith && (
                          <StatusBadge tone="active" label="Merged" />
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
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
