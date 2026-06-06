'use client';

import { Stack, Text } from '@mantine/core';
import { AccentPanel, ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { StatsStrip } from '@doneisbetter/gds-admin/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { cameraInfoToneMap } from '@/lib/gds/presentation';
import { AdminIcon } from '@/lib/gds/admin-icon-key';
import type { AdminIconKey } from '@/lib/gds/admin-icon-key';

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
          <ConsumerDashboardGrid columns={3}>
            {[
              {
                href: '/admin/partners',
                title: 'Open Partners',
                description: 'Use partner workspaces as the operational home for daily management.',
                iconKey: 'buildingStore' as AdminIconKey,
              },
              {
                href: '/admin/frames/new',
                title: 'Add New Frame',
                description: 'Create a new shared frame resource for partner and event use.',
                iconKey: 'plus' as AdminIconKey,
              },
              {
                href: '/admin/frames',
                title: 'Global Frames',
                description: 'Audit frame ownership and manage shared inventory.',
                iconKey: 'frame' as AdminIconKey,
              },
              {
                href: '/admin/landing-pages',
                title: 'Landing Pages',
                description: 'Manage shared experience surfaces and connected app actions.',
                iconKey: 'world' as AdminIconKey,
              },
              {
                href: '/admin/submissions',
                title: 'Global Galleries',
                description: 'Review submissions and cross-partner gallery activity.',
                iconKey: 'photoScan' as AdminIconKey,
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-label={`Open ${item.title}`}
                style={{
                  background:
                    'linear-gradient(135deg, var(--mantine-color-violet-2), var(--mantine-color-cyan-1))',
                  borderRadius: 20,
                  boxShadow: '0 14px 32px rgba(109, 40, 217, 0.16), 0 0 0 1px rgba(109, 40, 217, 0.16)',
                  color: 'inherit',
                  display: 'block',
                  padding: 2,
                  textDecoration: 'none',
                }}
              >
                <ProductCard
                  title={item.title}
                  description={item.description}
                  icon={<AdminIcon iconKey={item.iconKey} size={20} />}
                />
              </a>
            ))}
          </ConsumerDashboardGrid>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}
