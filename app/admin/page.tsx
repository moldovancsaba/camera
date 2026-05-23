/**
 * Admin Dashboard
 * 
 * Overview dashboard showing key metrics and recent activity.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconBuildingStore, IconFrame, IconPhotoScan, IconPlus, IconWorld } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import ActionCardGrid from '@/components/gds/ActionCardGrid';

export default async function AdminDashboard() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  // Get database statistics with error handling
  let framesCount = 0;
  let submissionsCount = 0;
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    
    [framesCount, submissionsCount] = await Promise.all([
      db.collection('frames').countDocuments(),
      db.collection('submissions').countDocuments(),
    ]);
  } catch (error) {
    console.error('Error connecting to database:', error);
    dbError = error;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Dashboard"
        description="Camera Core overview across partners, shared resources, and app operations."
        status="Global Admin"
        actions={
          <Link href="/admin/partners" style={{ textDecoration: 'none' }}>
            <Button color="cameraTeal">Open Partners</Button>
          </Link>
        }
      />

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      <StatsStrip
        items={[
          { label: 'Total Frames', value: framesCount, icon: <IconFrame size={20} /> },
          { label: 'Total Submissions', value: submissionsCount, icon: <IconPhotoScan size={20} /> },
          { label: 'Active Users', value: '-', icon: <IconBuildingStore size={20} />, tone: 'neutral' },
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
                icon: <IconBuildingStore size={20} />,
              },
              {
                href: '/admin/frames/new',
                title: 'Add New Frame',
                description: 'Create a new shared frame resource for partner and event use.',
                icon: <IconPlus size={20} />,
              },
              {
                href: '/admin/frames',
                title: 'Global Frames',
                description: 'Audit frame ownership and manage shared inventory.',
                icon: <IconFrame size={20} />,
              },
              {
                href: '/admin/landing-pages',
                title: 'Landing Pages',
                description: 'Manage shared experience surfaces and connected app actions.',
                icon: <IconWorld size={20} />,
              },
              {
                href: '/admin/submissions',
                title: 'Global Galleries',
                description: 'Review submissions and cross-partner gallery activity.',
                icon: <IconPhotoScan size={20} />,
              },
            ]}
          />
        </Stack>
      </Card>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          This dashboard is now the first Mantine-backed GDS reference surface inside Camera admin.
        </Text>
      </Group>
    </Stack>
  );
}
