'use client';

import { Stack, Text } from '@mantine/core';
import { AccentPanel } from '@doneisbetter/gds-core/client';
import { StatsStrip } from '@doneisbetter/gds-admin/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import ActionCardGrid from '@/components/gds/ActionCardGrid';
import { cameraInfoToneMap } from '@/lib/gds/presentation';

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
            stats={[
              { label: 'Total Frames', value: framesCount, iconKey: 'frame' },
              { label: 'Total Submissions', value: submissionsCount, iconKey: 'photoScan' },
              { label: 'Active Users', value: '—', iconKey: 'users' },
            ].map(({ label, value }) => ({ label, value }))}
          />

          <Stack gap="lg">
            <AccentPanel tone={cameraInfoToneMap.neutral} variant="subtle" title="Quick Actions">
              <Text size="sm" c="dimmed">
                Primary entry points for partner operations and shared resources.
              </Text>
            </AccentPanel>
            <div>
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
            </div>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}
