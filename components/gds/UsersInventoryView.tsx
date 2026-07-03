'use client';

import Link from 'next/link';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import UserManagementActions from '@/components/admin/UserManagementActions';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import { AdminDataTable } from '@sovereignsquad/gds-admin/client';
import { StateBlock, StatusBadge } from '@sovereignsquad/gds-core/client';
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

type UserTableRow = SerializedAdminUserRow & Record<string, unknown>;

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
  const rows: UserTableRow[] = users.map((user, index) => ({
    ...user,
    id: `${user.email}-${index}`,
  }));

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

          <AdminDataTable<UserTableRow>
            rows={rows}
            state="ready"
            getRowKey={(row) => String(row.id)}
            columns={[
              {
                key: 'identity',
                header: 'Identity',
                rowHeader: true,
                accessor: (row) => (
                  <div>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-xs)' }}>
                      <Link href={row.profileHref} style={{ fontWeight: 600, textDecoration: 'none' }}>
                        {row.name || 'Anonymous'}
                      </Link>
                      {row.isAnonymous ? <StatusBadge {...getStatusBadgeProps('info', 'Anonymous')} /> : null}
                      {row.type === 'administrator' ? <StatusBadge {...getStatusBadgeProps('info', 'Admin')} /> : null}
                      {row.type === 'pseudo' && !row.mergedWith ? <StatusBadge {...getStatusBadgeProps('info', 'Pseudo')} /> : null}
                      {!row.isActive ? <StatusBadge {...getStatusBadgeProps('inactive')} /> : null}
                      {row.mergedWith ? <StatusBadge {...getStatusBadgeProps('active', 'Merged')} /> : null}
                    </div>
                    <p style={{ color: 'var(--mantine-color-dimmed)', margin: '4px 0 0' }}>{row.accessLabel}</p>
                    <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>{row.emailDisplay}</p>
                  </div>
                ),
              },
              {
                key: 'participation',
                header: 'Participation',
                accessor: (row) => (
                  <div style={{ display: 'grid', gap: 2 }}>
                    <span>{row.photosCount} photos</span>
                    <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                      Last event: {row.eventName || 'Unknown Event'}
                    </span>
                    <span style={{ color: 'var(--mantine-color-dimmed)' }}>Registered: {row.collectedAtLabel}</span>
                  </div>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                accessor: (row) => (
                  <UserManagementActions
                    user={{
                      email: row.email,
                      name: row.name,
                      type: row.type,
                      role: row.role,
                      isActive: row.isActive,
                      mergedWith: row.mergedWith,
                    }}
                    currentUserEmail={currentUserEmail}
                  />
                ),
              },
            ]}
            renderMobileCard={(row) => (
              <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
                <Link href={row.profileHref} style={{ fontWeight: 700, textDecoration: 'none' }}>
                  {row.name || 'Anonymous'}
                </Link>
                <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>{row.emailDisplay}</p>
                <UserManagementActions
                  user={{
                    email: row.email,
                    name: row.name,
                    type: row.type,
                    role: row.role,
                    isActive: row.isActive,
                    mergedWith: row.mergedWith,
                  }}
                  currentUserEmail={currentUserEmail}
                />
              </div>
            )}
          />
        </div>
      )}
    </AdminListPageShell>
  );
}
