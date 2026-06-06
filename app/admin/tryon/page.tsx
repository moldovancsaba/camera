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
import { activeTryOnQueueTotal, formatActiveTryOnQueueSummary, WORKER_OWNED_TRYON_QUEUE_STATUSES } from '@/lib/tryon/queue-status';
import {
  formatTryOnWorkerHealthDescription,
  formatTryOnWorkerHealthTitle,
  summarizeTryOnWorkerHealth,
  type TryOnWorkerHealthSummary,
} from '@/lib/tryon/worker-health';

export const dynamic = 'force-dynamic';

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
  let workerHealth: TryOnWorkerHealthSummary | null = null;

  try {
    const db = await connectToDatabase();
    const [queueStatusCounts, activeSuits, totalSuits, pendingVetting, runningJobs] = await Promise.all([
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
      db
        .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
        .find({ status: { $in: [...WORKER_OWNED_TRYON_QUEUE_STATUSES] } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .toArray(),
    ]);

    queueCounts = Object.fromEntries(queueStatusCounts.map((item) => [item._id, item.count]));
    activeSuitCount = activeSuits;
    totalSuitCount = totalSuits;
    pendingVettingCount = pendingVetting;
    workerHealth = summarizeTryOnWorkerHealth(runningJobs, activeTryOnQueueTotal(queueCounts));
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
                title: `Queue Status (${activeTryOnQueueTotal(queueCounts)})`,
                description: formatActiveTryOnQueueSummary(queueCounts),
                iconKey: 'photoScan' as AdminIconKey,
              },
              {
                href: '/admin/tryon/queue?status=processing',
                title: workerHealth ? formatTryOnWorkerHealthTitle(workerHealth) : 'Worker Unknown',
                description: workerHealth
                  ? formatTryOnWorkerHealthDescription(workerHealth)
                  : 'Worker health could not be loaded.',
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
              {
                href: '/admin/tryon/analytics',
                title: 'Analytics',
                description: 'Review approved, rejected, service, greatest, preset, garment, and event performance.',
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
