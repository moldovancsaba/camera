'use client';

import Link from 'next/link';
import { ConsumerDashboardGrid, ProductCard, MetricCard } from '@/components/gds/ClientWrappers';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { getVisibleAdminNavSections, type AdminNavigationAccess } from '@/lib/adminNavigation';
import type { ActiveEventRow } from '@/lib/tryon/dashboard-metrics';

export interface DashboardAttentionMetrics {
  pendingVettingCount: number;
  activeQueueTotal: number;
  eventsLiveCount: number;
  // null for a partner-scoped session — worker health describes shared
  // infrastructure, not any one partner's events.
  workerHealthTitle: string | null;
  workerHealthDescription: string | null;
}

export default function AdminDashboardView({
  navigationAccess,
  metrics,
  activeEvents,
  dbError,
}: {
  navigationAccess: AdminNavigationAccess;
  metrics: DashboardAttentionMetrics | null;
  activeEvents: ActiveEventRow[];
  dbError?: MongoConnectionDiagnosis | null;
}) {
  // Drop the "Dashboard" self-link from the grid — it's the page already on
  // screen. It stays in the sidebar via the same shared config.
  const sections = getVisibleAdminNavSections(navigationAccess)
    .map((section) => ({ ...section, items: section.items.filter((item) => item.href !== '/admin') }))
    .filter((section) => section.items.length > 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <WorkspaceHeader
        eyebrow="Overview"
        title="Dashboard"
        description={
          navigationAccess.isGlobalAdmin
            ? 'What needs attention across every event today.'
            : 'What needs attention across your events today.'
        }
        status={navigationAccess.isGlobalAdmin ? 'Global Admin' : undefined}
      />

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError && metrics ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Link href="/admin/tryon/vetting" style={{ color: 'inherit', textDecoration: 'none' }}>
            <MetricCard
              label="Pending vetting"
              value={metrics.pendingVettingCount}
              description="Try-on results waiting for approval or rejection."
              icon={<AdminIcon iconKey="photoScan" size={18} />}
            />
          </Link>
          <Link href="/admin/tryon/queue" style={{ color: 'inherit', textDecoration: 'none' }}>
            <MetricCard
              label="Active queue"
              value={metrics.activeQueueTotal}
              description="Try-on jobs queued or in progress right now."
              icon={<AdminIcon iconKey="photoScan" size={18} />}
            />
          </Link>
          {metrics.workerHealthTitle ? (
            <Link href="/admin/tryon/queue?status=processing" style={{ color: 'inherit', textDecoration: 'none' }}>
              <MetricCard
                label="Worker"
                value={metrics.workerHealthTitle}
                description={metrics.workerHealthDescription ?? undefined}
                icon={<AdminIcon iconKey="sparkles" size={18} />}
              />
            </Link>
          ) : null}
          <Link href="/admin/events" style={{ color: 'inherit', textDecoration: 'none' }}>
            <MetricCard
              label="Active events"
              value={metrics.eventsLiveCount}
              description="Event instances currently marked active."
              icon={<AdminIcon iconKey="brandDatabricks" size={18} />}
            />
          </Link>
        </div>
      ) : null}

      {!dbError && activeEvents.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
          <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>Active events</strong>
          <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
            {activeEvents.map((event) => (
              <Link
                key={event.id}
                href={
                  event.eventUuid
                    ? `/admin/tryon/vetting?eventId=${encodeURIComponent(event.eventUuid)}`
                    : `/admin/events/${event.id}`
                }
                style={{
                  alignItems: 'center',
                  background: 'var(--mantine-color-body)',
                  border: '1px solid var(--mantine-color-gray-3)',
                  borderRadius: 12,
                  color: 'inherit',
                  display: 'flex',
                  gap: 'var(--mantine-spacing-sm)',
                  justifyContent: 'space-between',
                  padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</strong>
                  <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
                    {event.partnerName}
                  </span>
                </div>
                {event.pendingVettingCount > 0 ? (
                  <span
                    style={{
                      background: 'var(--mantine-color-orange-1)',
                      borderRadius: 999,
                      color: 'var(--mantine-color-orange-8)',
                      flexShrink: 0,
                      fontSize: 'var(--mantine-font-size-xs)',
                      fontWeight: 600,
                      padding: '4px 10px',
                    }}
                  >
                    {event.pendingVettingCount} pending
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!dbError ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
          {sections.map((section) => (
            <div key={section.title} style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
              <div>
                <strong style={{ fontSize: 'var(--mantine-font-size-md)' }}>{section.title}</strong>
                <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-sm)', margin: '2px 0 0' }}>
                  {section.description}
                </p>
              </div>
              <ConsumerDashboardGrid columns={3}>
                {section.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-label={`Open ${item.label}`}
                    style={{
                      background: 'linear-gradient(135deg, var(--mantine-color-violet-2), var(--mantine-color-cyan-1))',
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
                      title={item.label}
                      description={item.description}
                      icon={<AdminIcon iconKey={item.iconKey as AdminIconKey} size={20} />}
                    />
                  </a>
                ))}
              </ConsumerDashboardGrid>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
