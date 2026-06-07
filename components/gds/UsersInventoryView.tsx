'use client';

import Link from 'next/link';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import UserManagementActions from '@/components/admin/UserManagementActions';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedAdminUserRow {
  email: string;
  name: string;
  type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
  role?: string;
  isActive?: boolean;
  isAnonymous?: boolean;
  mergedWith?: string;
  collectedAtLabel: string;
  eventName?: string | null;
  photosCount: number;
  profileHref: string;
  emailDisplay: string;
  accessLabel: string;
  partnerAccess: Array<{
    accessId: string;
    partnerId: string;
    partnerName: string;
    appKey: 'events';
    role: 'viewer' | 'manager' | 'admin';
    isActive: boolean;
  }>;
}

export default function UsersInventoryView({
  users,
  search,
  currentUserEmail,
  stats,
  dbError,
}: {
  users: SerializedAdminUserRow[];
  search: string;
  currentUserEmail: string;
  stats: {
    accessManaged: number;
    guests: number;
    anonymous: number;
    representedSubmissions: number;
  };
  dbError?: MongoConnectionDiagnosis | null;
}) {
  return (
    <AdminListPageShell
      eyebrow="Camera Core"
      title="Global Users"
      description="Global access management plus participation records derived from Camera submissions."
      status="Global Admin"
      stats={[
        { label: 'Access-managed accounts', value: stats.accessManaged, iconKey: 'userShield' },
        { label: 'Guest identities', value: stats.guests, iconKey: 'users' },
        { label: 'Anonymous participants', value: stats.anonymous, iconKey: 'user' },
        { label: 'Represented submissions', value: stats.representedSubmissions, iconKey: 'photoScan' },
      ]}
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search by name, email, partner, or event',
        clearHref: '/admin/users',
      }}
      dbError={dbError}
    >
      {users.length === 0 ? (
        <section style={{ padding: 'var(--mantine-spacing-xl)' }}>
          <StateBlock variant="empty" title="No users yet" description="Waiting for first submissions" />
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-lg)' }}>
          <AuthorizationMatrix description="Use this matrix when deciding whether a user belongs in global SSO admin management or in partner-scoped Camera assignments." />

          <section
            style={{
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-md)',
              padding: 'var(--mantine-spacing-md)',
            }}
          >
            <p style={{ margin: 0 }}>
              This page manages global Camera access today. Partner-level permissions are not modeled separately yet, so guest and participation records below are derived from submissions rather than a dedicated partner access table.
            </p>
          </section>

          <section
            style={{
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-md)',
              overflow: 'hidden',
            }}
          >
            <div style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', padding: '1rem 1.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', margin: 0 }}>
                Directory and Participation History
              </h2>
              <p style={{ color: 'var(--mantine-color-dimmed)', margin: '4px 0 0' }}>
                Operators can manage global roles and status here while still seeing how each identity shows up in event participation.
              </p>
            </div>
            <div>
              {users.map((user, index) => (
                <div
                  key={`${user.email}-${index}`}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--mantine-color-gray-2)',
                  }}
                >
                  <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-xs)', marginBottom: 'var(--mantine-spacing-sm)' }}>
                        <Link
                          href={user.profileHref}
                          style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textDecoration: 'none', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {user.name || 'Anonymous'}
                        </Link>
                        {user.isAnonymous ? <StatusBadge {...getStatusBadgeProps('info', 'Anonymous')} /> : null}
                        {user.type === 'administrator' ? <StatusBadge {...getStatusBadgeProps('info', 'Admin')} /> : null}
                        {user.type === 'pseudo' && !user.mergedWith ? <StatusBadge {...getStatusBadgeProps('info', 'Pseudo')} /> : null}
                        {!user.isActive ? <StatusBadge {...getStatusBadgeProps('inactive')} /> : null}
                        {user.mergedWith ? <StatusBadge {...getStatusBadgeProps('active', 'Merged')} /> : null}
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <p style={{ fontWeight: 500, margin: 0 }}>
                          {user.accessLabel}
                        </p>
                        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.emailDisplay}
                        </p>
                        {user.partnerAccess.length > 0 ? (
                          <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>
                            Partner access:{' '}
                            {user.partnerAccess.slice(0, 2).map((assignment, idx) => (
                              <span key={assignment.accessId}>
                                {idx > 0 ? ', ' : ''}
                                <Link
                                  href={`/admin/partners?search=${encodeURIComponent(assignment.partnerName)}`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  {assignment.partnerName}
                                </Link>{' '}
                                ({assignment.appKey}/{assignment.role})
                              </span>
                            ))}
                            {user.partnerAccess.length > 2 ? ` +${user.partnerAccess.length - 2} more` : ''}
                          </p>
                        ) : null}
                        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.photosCount} photos
                        </p>
                        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Last Event: {user.eventName || 'Unknown Event'}
                        </p>
                        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Registered: {user.collectedAtLabel}
                        </p>
                      </div>
                    </div>
                    <div style={{ width: '100%', maxWidth: 320 }}>
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
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminListPageShell>
  );
}
