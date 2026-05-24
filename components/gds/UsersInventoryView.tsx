'use client';

import Link from 'next/link';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import UserManagementActions from '@/components/admin/UserManagementActions';
import AdminListPageShell from '@/components/gds/AdminListPageShell';
import StatusBadge from '@/components/gds/StatusBadge';
import StateBlock from '@/components/gds/StateBlock';
import { Card, Stack, Text } from '@mantine/core';

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
        <Card p="xl">
          <StateBlock variant="empty" title="No users yet" description="Waiting for first submissions" />
        </Card>
      ) : (
        <Stack gap="lg">
          <AuthorizationMatrix description="Use this matrix when deciding whether a user belongs in global SSO admin management or in partner-scoped Camera assignments." />

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
            <div>
              {users.map((user, index) => (
                <div
                  key={`${user.email}-${index}`}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--mantine-color-gray-2)',
                  }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Link href={user.profileHref} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">
                          {user.name || 'Anonymous'}
                        </Link>
                        {user.isAnonymous ? <StatusBadge tone="info" label="Anonymous" /> : null}
                        {user.type === 'administrator' ? <StatusBadge tone="info" label="Admin" /> : null}
                        {user.type === 'pseudo' && !user.mergedWith ? <StatusBadge tone="info" label="Pseudo" /> : null}
                        {!user.isActive ? <StatusBadge tone="inactive" /> : null}
                        {user.mergedWith ? <StatusBadge tone="active" label="Merged" /> : null}
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{user.accessLabel}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">{user.emailDisplay}</div>
                        {user.partnerAccess.length > 0 ? (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Partner access:{' '}
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
                        ) : null}
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">{user.photosCount} photos</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">Last Event: {user.eventName || 'Unknown Event'}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">Registered: {user.collectedAtLabel}</div>
                      </div>
                    </div>
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
              ))}
            </div>
          </Card>
        </Stack>
      )}
    </AdminListPageShell>
  );
}
