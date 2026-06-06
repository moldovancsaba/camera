import { redirect } from 'next/navigation';
import { ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { Stack } from '@mantine/core';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { COLLECTIONS, type LeatherSuit, type Submission, type TryOnJob } from '@/lib/db/schemas';

export const dynamic = 'force-dynamic';

function formatQueueSummary(counts: Record<string, number>) {
  return [
    `Queued ${counts.queued ?? 0}`,
    `Processing ${(counts.claimed ?? 0) + (counts.processing ?? 0) + (counts.uploading_result ?? 0)}`,
    `Retry ${counts.retry_wait ?? 0}`,
  ].join(' · ');
}

function activeQueueTotal(counts: Record<string, number>) {
  return (
    (counts.queued ?? 0) +
    (counts.claimed ?? 0) +
    (counts.processing ?? 0) +
    (counts.uploading_result ?? 0) +
    (counts.retry_wait ?? 0)
  );
}

export default async function AdminTryOnAppPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let dbError = null;
  let queueCounts: Record<string, number> = {};
  let activeSuitCount = 0;
  let totalSuitCount = 0;
  let pendingVettingCount = 0;

  try {
    const db = await connectToDatabase();
    const [queueStatusCounts, activeSuits, totalSuits, pendingVetting] = await Promise.all([
      db
        .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).countDocuments({ active: true }),
      db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).countDocuments({}),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        reviewStatus: 'pending_review',
        'tryOnModerationArchive.archived': { $ne: true },
      }),
    ]);

    queueCounts = Object.fromEntries(queueStatusCounts.map((item) => [item._id, item.count]));
    activeSuitCount = activeSuits;
    totalSuitCount = totalSuits;
    pendingVettingCount = pendingVetting;
  } catch (error) {
    console.error('Error loading try-on app workspace:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Apps"
        title="Try-On App"
        status="Global Admin"
        primaryAction={{ href: '/admin/tryon/queue', label: 'Open Queue' }}
      />

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError ? (
        <>
        <ConsumerDashboardGrid columns={3}>
            {[
              {
                href: '/admin/tryon/queue',
                title: `Queue Status (${activeQueueTotal(queueCounts)})`,
                description: formatQueueSummary(queueCounts),
                iconKey: 'photoScan' as AdminIconKey,
              },
              {
                href: '/admin/tryon/suits',
                title: `Garments (${activeSuitCount}/${totalSuitCount})`,
                description: `Active ${activeSuitCount} · Total ${totalSuitCount}. Manage the selectable garment catalog for events and user capture flows.`,
                iconKey: 'photo' as AdminIconKey,
              },
              {
                href: '/admin/tryon/vetting',
                title: `Vetting (${pendingVettingCount})`,
                description: `${pendingVettingCount} pending generated result${pendingVettingCount === 1 ? '' : 's'} waiting for approval or rejection.`,
                iconKey: 'world' as AdminIconKey,
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
        </>
      ) : null}
    </Stack>
  );
}
