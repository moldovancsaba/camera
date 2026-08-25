import { redirect } from 'next/navigation';
import { ConsumerDashboardGrid, ProductCard } from '@/components/gds/ClientWrappers';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { formatActiveTryOnQueueSummary } from '@/lib/tryon/queue-status';
import { formatTryOnWorkerHealthDescription, formatTryOnWorkerHealthTitle } from '@/lib/tryon/worker-health';
import { collectTryOnDashboardMetrics, type TryOnDashboardMetrics } from '@/lib/tryon/dashboard-metrics';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnAppPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let dbError = null;
  let metrics: TryOnDashboardMetrics | null = null;

  try {
    const db = await connectToDatabase();
    metrics = await collectTryOnDashboardMetrics(db);
  } catch (error) {
    console.error('Error loading try-on app workspace:', error);
    dbError = serializeMongoError(error);
  }

  const queueCounts = metrics?.queueCounts ?? {};
  const activeQueueTotal = metrics?.activeQueueTotal ?? 0;
  const activeSuitCount = metrics?.activeSuitCount ?? 0;
  const totalSuitCount = metrics?.totalSuitCount ?? 0;
  const pendingVettingCount = metrics?.pendingVettingCount ?? 0;
  const workerHealth = metrics?.workerHealth ?? null;

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <WorkspaceHeader
        eyebrow="Apps"
        title="Operations"
        description="Try-on queue, vetting, analytics, and cleanup — the daily work connected to every event."
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
                title: `Queue Status (${activeQueueTotal})`,
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
              {
                href: '/admin/tryon/identity',
                title: 'Identity Cleanup',
                description: 'Review guest placeholders, correct identities, and mark unrecoverable rows as reviewed.',
                iconKey: 'users' as AdminIconKey,
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
                  boxShadow:
                    '0 14px 32px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent)',
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
    </div>
  );
}
