'use client';

import { Card, Stack, Text } from '@mantine/core';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import ActionCardGrid from '@/components/gds/ActionCardGrid';

export default function AdminDashboardView({
  framesCount,
  submissionsCount,
  dbError,
}: {
  framesCount: number;
  submissionsCount: number;
  dbError?: MongoConnectionDiagnosis | null;
}) {
  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Dashboard"
        description="Camera Core overview across partners, shared resources, and app operations."
        status="Global Admin"
        primaryAction={{ href: '/admin/partners', label: 'Open Partners' }}
      />

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError ? (
        <>
          <StatsStrip
            items={[
              { label: 'Total Frames', value: framesCount, iconKey: 'frame' },
              { label: 'Total Submissions', value: submissionsCount, iconKey: 'photoScan' },
              { label: 'Active Users', value: '—', iconKey: 'users' },
            ]}
          />

          <Card>
            <Stack gap="lg">
              <div>
                <Text fw={700} fz="lg">
                  Quick Actions
                </Text>
                <Text size="sm" c="dimmed">
                  Primary entry points for partner operations and shared resources.
                </Text>
              </div>
              <ActionCardGrid
                items={[
                  {
                    href: '/admin/partners',
                    title: 'Open Partners',
                    description: 'Use partner workspaces as the operational home for daily management.',
                    iconKey: 'buildingStore',
                  },
                  {
                    href: '/admin/frames/new',
                    title: 'Add New Frame',
                    description: 'Create a new shared frame resource for partner and event use.',
                    iconKey: 'plus',
                  },
                  {
                    href: '/admin/frames',
                    title: 'Global Frames',
                    description: 'Audit frame ownership and manage shared inventory.',
                    iconKey: 'frame',
                  },
                  {
                    href: '/admin/landing-pages',
                    title: 'Landing Pages',
                    description: 'Manage shared experience surfaces and connected app actions.',
                    iconKey: 'world',
                  },
                  {
                    href: '/admin/submissions',
                    title: 'Global Galleries',
                    description: 'Review submissions and cross-partner gallery activity.',
                    iconKey: 'photoScan',
                  },
                ]}
              />
            </Stack>
          </Card>
        </>
      ) : null}
    </Stack>
  );
}
