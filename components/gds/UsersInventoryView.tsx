'use client';

import Link from 'next/link';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import UserManagementActions from '@/components/admin/UserManagementActions';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { Box, Card, Group, Stack, Text } from '@mantine/core';
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
        <Card p="xl">
          <StateBlock variant="empty" title="No users yet" description="Waiting for first submissions" />
        </Card>
      ) : (
        <Stack gap="lg">
          <AuthorizationMatrix description="Use this matrix when deciding whether a user belongs in global SSO admin management or in partner-scoped Camera assignments." />

          <Card
            style={{
              background: 'color-mix(in srgb, var(--mantine-color-yellow-4) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--mantine-color-yellow-6) 35%, transparent)',
            }}
          >
            <Text size="sm">
              This page manages global Camera access today. Partner-level permissions are not modeled separately yet, so guest and participation records below are derived from submissions rather than a dedicated partner access table.
            </Text>
          </Card>

          <Card p={0} style={{ overflow: 'hidden' }}>
            <div style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', padding: '1rem 1.5rem' }}>
              <Text fw={700} fz="lg">
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
                  <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" wrap="wrap" mb="sm">
                        <Text
                          component={Link}
                          href={user.profileHref}
                          fw={600}
                          c="blue.6"
                          style={{ textDecoration: 'none' }}
                          truncate
                        >
                          {user.name || 'Anonymous'}
                        </Text>
                        {user.isAnonymous ? <StatusBadge {...getStatusBadgeProps('info', 'Anonymous')} /> : null}
                        {user.type === 'administrator' ? <StatusBadge {...getStatusBadgeProps('info', 'Admin')} /> : null}
                        {user.type === 'pseudo' && !user.mergedWith ? <StatusBadge {...getStatusBadgeProps('info', 'Pseudo')} /> : null}
                        {!user.isActive ? <StatusBadge {...getStatusBadgeProps('inactive')} /> : null}
                        {user.mergedWith ? <StatusBadge {...getStatusBadgeProps('active', 'Merged')} /> : null}
                      </Group>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {user.accessLabel}
                        </Text>
                        <Text size="sm" c="dimmed" truncate>
                          {user.emailDisplay}
                        </Text>
                        {user.partnerAccess.length > 0 ? (
                          <Text size="sm" c="dimmed">
                            Partner access:{' '}
                            {user.partnerAccess.slice(0, 2).map((assignment, idx) => (
                              <span key={assignment.accessId}>
                                {idx > 0 ? ', ' : ''}
                                <Text
                                  component={Link}
                                  href={`/admin/partners?search=${encodeURIComponent(assignment.partnerName)}`}
                                  span
                                  c="blue.6"
                                  style={{ textDecoration: 'none' }}
                                >
                                  {assignment.partnerName}
                                </Text>{' '}
                                ({assignment.appKey}/{assignment.role})
                              </span>
                            ))}
                            {user.partnerAccess.length > 2 ? ` +${user.partnerAccess.length - 2} more` : ''}
                          </Text>
                        ) : null}
                        <Text size="sm" c="dimmed" truncate>
                          {user.photosCount} photos
                        </Text>
                        <Text size="sm" c="dimmed" truncate>
                          Last Event: {user.eventName || 'Unknown Event'}
                        </Text>
                        <Text size="sm" c="dimmed" truncate>
                          Registered: {user.collectedAtLabel}
                        </Text>
                      </Stack>
                    </Box>
                    <Box style={{ width: '100%', maxWidth: 320 }}>
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
                    </Box>
                  </Group>
                </div>
              ))}
            </div>
          </Card>
        </Stack>
      )}
    </AdminListPageShell>
  );
}
