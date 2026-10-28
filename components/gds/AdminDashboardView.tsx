'use client';

import Link from 'next/link';
import { ConsumerDashboardGrid, ProductCard, MetricCard } from '@/components/gds/ClientWrappers';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { getVisibleAdminNavSections, type AdminNavigationAccess } from '@/lib/adminNavigation';
import type { ActiveEventRow } from '@/lib/admin/active-events';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export interface DashboardAttentionMetrics {
  /** Photos waiting for approval. */
  pendingVettingCount: number;
  eventsLiveCount: number;
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
  const language = useUiLanguage();
  const t = (source: string) => adminPageText(source, language);
  // Drop the "Dashboard" self-link from the grid — it's the page already on
  // screen. It stays in the sidebar via the same shared config.
  const sections = getVisibleAdminNavSections(navigationAccess)
    .map((section) => ({ ...section, items: section.items.filter((item) => item.href !== '/admin') }))
    .filter((section) => section.items.length > 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <div lang={language} dir={uiLanguageDirection(language)}>
        <WorkspaceHeader
          eyebrow={t('Overview')}
          title={t('Dashboard')}
          description={
            navigationAccess.isGlobalAdmin
              ? t('What needs attention across every event today.')
              : t('What needs attention across your events today.')
          }
          status={navigationAccess.isGlobalAdmin ? t('Global Admin') : undefined}
        />
      </div>

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError && metrics ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Link href="/admin/vetting" lang={language} dir={uiLanguageDirection(language)} style={{ color: 'inherit', textDecoration: 'none' }}>
            <MetricCard
              label={t('Pending vetting')}
              value={metrics.pendingVettingCount}
              description={t('Photos waiting for approval or rejection.')}
              icon={<AdminIcon iconKey="photoScan" size={18} />}
            />
          </Link>
          <Link href="/admin/events" lang={language} dir={uiLanguageDirection(language)} style={{ color: 'inherit', textDecoration: 'none' }}>
            <MetricCard
              label={t('Active events')}
              value={metrics.eventsLiveCount}
              description={t('Event instances currently marked active.')}
              icon={<AdminIcon iconKey="brandDatabricks" size={18} />}
            />
          </Link>
        </div>
      ) : null}

      {!dbError && activeEvents.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
          <strong lang={language} style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{t('Active events')}</strong>
          <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
            {activeEvents.map((event) => (
              <Link
                key={event.id}
                href={event.photosWaiting > 0 ? `/admin/events/${event.id}/vetting` : `/admin/events/${event.id}`}
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
                {event.photosWaiting > 0 ? (
                  <span
                    lang="en"
                    style={{
                      background: 'var(--mantine-color-blue-1)',
                      borderRadius: 999,
                      color: 'var(--mantine-color-blue-8)',
                      flexShrink: 0,
                      fontSize: 'var(--mantine-font-size-xs)',
                      fontWeight: 600,
                      padding: '4px 10px',
                    }}
                  >
                    {event.photosWaiting} {event.photosWaiting === 1 ? 'photo' : 'photos'} waiting
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
              <strong lang={language} style={{ fontSize: 'var(--mantine-font-size-md)' }}>{t(section.title)}</strong>
                <p lang="en" style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-sm)', margin: '2px 0 0' }}>
                  {section.description}
                </p>
              </div>
              <ConsumerDashboardGrid columns={3}>
                {section.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-label={`${t('Open')} ${t(item.label)}`}
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
                    <div lang={language} dir={uiLanguageDirection(language)}>
                      <ProductCard
                        title={t(item.label)}
                        description={<span lang="en">{item.description}</span>}
                        icon={<AdminIcon iconKey={item.iconKey as AdminIconKey} size={20} />}
                      />
                    </div>
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
