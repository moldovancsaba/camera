import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { COLLECTIONS } from '@/lib/db/schemas';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import ActionCardGrid from '@/components/gds/ActionCardGrid';
import InfoCard from '@/components/gds/InfoCard';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { SimpleGrid, Stack } from '@/components/gds/ui';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnAppPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let dbError = null;
  let queueCount = 0;
  let pendingReviewCount = 0;
  let activeSuitCount = 0;
  let failedCount = 0;

  try {
    const db = await connectToDatabase();
    const [queued, pendingReview, activeSuits, failed] = await Promise.all([
      db.collection(COLLECTIONS.TRYON_JOBS).countDocuments({
        status: { $in: ['queued', 'claimed', 'processing', 'uploading_result', 'retry_wait'] },
      }),
      db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        reviewStatus: 'pending_review',
        isArchived: { $ne: true },
      }),
      db.collection(COLLECTIONS.LEATHER_SUITS).countDocuments({ active: true }),
      db.collection(COLLECTIONS.TRYON_JOBS).countDocuments({ status: 'failed' }),
    ]);

    queueCount = queued;
    pendingReviewCount = pendingReview;
    activeSuitCount = activeSuits;
    failedCount = failed;
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
          <StatsStrip
            items={[
              { label: 'Jobs In Queue', value: queueCount, iconKey: 'photoScan' },
              { label: 'Pending Vetting', value: pendingReviewCount, iconKey: 'photo' },
              { label: 'Active Jerseys', value: activeSuitCount, iconKey: 'photo' },
              { label: 'Failed Jobs', value: failedCount, iconKey: 'photo' },
            ]}
          />

          <SimpleGrid cols={{ base: 1, xl: 3 }}>
            <InfoCard
              tone="blue"
              title="Queue is operational state"
              description="Use the queue view to see queued, claimed, retrying, failed, and completed jobs directly from Atlas instead of relying on local shell output."
            />
            <InfoCard
              tone="green"
              title="Leather jerseys are catalog entries"
              description="Manage the user-selectable catalog here with a clean title and description. The local try-on machine still needs the matching asset file."
            />
            <InfoCard
              tone="yellow"
              title="Vetting controls publication"
              description="Generated results remain private until approved. Approval is what makes them visible on share pages and eligible for result slideshows."
            />
          </SimpleGrid>

          <ActionCardGrid
            items={[
              {
                href: '/admin/tryon/queue',
                title: 'Queue Status',
                description: 'See actual live job status across queued, processing, retry, done, and failed states.',
                iconKey: 'photoScan',
              },
              {
                href: '/admin/tryon/suits',
                title: 'Leather Jerseys',
                description: 'Manage the selectable leather suit catalog for events and user capture flows.',
                iconKey: 'photo',
              },
              {
                href: '/admin/tryon/vetting',
                title: 'Vetting Queue',
                description: 'Approve or reject completed generated results before they go public.',
                iconKey: 'world',
              },
            ]}
          />
        </>
      ) : null}
    </Stack>
  );
}
