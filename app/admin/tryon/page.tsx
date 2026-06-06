import { redirect } from 'next/navigation';
import { AccentPanel } from '@doneisbetter/gds-core/server';
import { ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { cameraInfoToneMap } from '@/lib/gds/presentation';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnAppPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let dbError = null;

  try {
    await connectToDatabase();
  } catch (error) {
    console.error('Error loading try-on app workspace:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Apps"
        title="Try-On App"
        description="Operate the local AI leather pipeline from one workspace: live queue state, selectable leather jersey catalog, and moderation."
        status="Global Admin"
        primaryAction={{ href: '/admin/tryon/queue', label: 'Open Queue' }}
      />

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError ? (
        <>
          <SimpleGrid cols={{ base: 1, xl: 3 }}>
            <AccentPanel tone={cameraInfoToneMap.blue} variant="subtle" title="Queue is operational state">
              <Text size="sm" c="dimmed">
                Use the queue view to see queued, claimed, retrying, failed, and completed jobs directly from Atlas instead of relying on local shell output.
              </Text>
            </AccentPanel>
            <AccentPanel tone={cameraInfoToneMap.green} variant="subtle" title="Leather jerseys are catalog entries">
              <Text size="sm" c="dimmed">
                Manage the user-selectable catalog here as Camera-hosted uploaded assets. The local try-on machine now downloads the suit image directly from Camera-managed storage.
              </Text>
            </AccentPanel>
            <AccentPanel tone={cameraInfoToneMap.yellow} variant="subtle" title="Vetting controls publication">
              <Text size="sm" c="dimmed">
                Generated results remain private until approved. Approval is what makes them visible on share pages and eligible for result slideshows.
              </Text>
            </AccentPanel>
          </SimpleGrid>

        <ConsumerDashboardGrid columns={3}>
            {[
              {
                href: '/admin/tryon/queue',
                title: 'Queue Status',
                description: 'See actual live job status across queued, processing, retry, done, and failed states.',
                iconKey: 'photoScan' as AdminIconKey,
              },
              {
                href: '/admin/tryon/suits',
                title: 'Leather Jerseys',
                description: 'Manage the selectable leather suit catalog for events and user capture flows.',
                iconKey: 'photo' as AdminIconKey,
              },
              {
                href: '/admin/tryon/vetting',
                title: 'Vetting Queue',
                description: 'Approve or reject completed generated results before they go public.',
                iconKey: 'world' as AdminIconKey,
              },
            ].map((item) => (
              <ProductCard
                key={item.href}
                title={item.title}
                description={item.description}
                icon={<AdminIcon iconKey={item.iconKey} size={20} />}
                primaryAction={
                  <a href={item.href} style={{ textDecoration: 'none' }}>
                    Open
                  </a>
                }
              />
            ))}
          </ConsumerDashboardGrid>
        </>
      ) : null}
    </Stack>
  );
}
