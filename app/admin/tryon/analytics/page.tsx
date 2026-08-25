import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import {
  collectTryOnAnalytics,
  collectCrossEventUserAnalytics,
  collectEventSpecificStats,
  resolveTryOnAnalyticsEventScope,
  type TryOnAnalyticsBucket,
  type CrossEventAnalyticsResult,
  type EventSpecificStats,
  type TryOnAnalyticsEventScope,
} from '@/lib/tryon/analytics';
import HourlyOutcomeChart from '@/components/admin/HourlyOutcomeChart';
import TryOnAnalyticsTables from '@/components/admin/TryOnAnalyticsTables';
import TryOnFunnelChart from '@/components/admin/TryOnFunnelChart';
import TryOnAnalyticsFilterForm from '@/components/admin/TryOnAnalyticsFilterForm';
import TryOnAnalyticsExportControls from '@/components/admin/TryOnAnalyticsExportControls';

export const dynamic = 'force-dynamic';

function bucketParam(value: string): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

export default async function AdminTryOnAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ bucket?: string; eventId?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const bucket = bucketParam(typeof resolvedSearchParams.bucket === 'string' ? resolvedSearchParams.bucket : '');
  const eventId = typeof resolvedSearchParams.eventId === 'string' ? resolvedSearchParams.eventId.trim() : '';
  const from = typeof resolvedSearchParams.from === 'string' ? resolvedSearchParams.from.trim() : '';
  const to = typeof resolvedSearchParams.to === 'string' ? resolvedSearchParams.to.trim() : '';

  let analytics = null;
  let crossEventAnalytics: CrossEventAnalyticsResult | null = null;
  let eventStats: EventSpecificStats | null = null;
  let dbError = null;
  let eventScope: TryOnAnalyticsEventScope = {};

  try {
    const db = await connectToDatabase();
    // WHAT: Resolve the event reference to both key namespaces before filtering.
    // WHY: Submissions are UUID-keyed and jobs are Mongo-id-keyed; passing the raw
    // reference to both (the previous behavior) left half of every event-filtered
    // funnel silently at zero — whichever half was keyed by the other namespace.
    if (eventId) {
      eventScope = await resolveTryOnAnalyticsEventScope(db, eventId);
    }
    analytics = await collectTryOnAnalytics(db, {
      bucket,
      eventId: eventScope.eventId ?? (eventId || undefined),
      eventMongoId: eventScope.eventMongoId,
      from: from || undefined,
      to: to || undefined,
    });

    if (!eventId) {
      crossEventAnalytics = await collectCrossEventUserAnalytics(db);
    } else {
      eventStats = await collectEventSpecificStats(db, eventScope.eventId ?? eventId);
    }
  } catch (error) {
    console.error('Error loading try-on analytics:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Analytics"
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        analytics
          ? [
              { label: 'Approved', value: analytics.totals.approved, iconKey: 'photo' as const },
              { label: 'Declined', value: analytics.totals.rejected, iconKey: 'photo' as const },
              { label: 'Service', value: analytics.totals.service, iconKey: 'photo' as const },
              { label: 'Superseded', value: analytics.totals.supersededRerun, iconKey: 'photo' as const },
            ]
          : eventStats
          ? [
              { label: 'Total Images', value: eventStats.totalSubmissions, iconKey: 'photo' },
              { label: 'AI Try-ons', value: eventStats.tryOnCount, iconKey: 'photo' },
              { label: 'Original Captures', value: eventStats.originalCount, iconKey: 'photo' },
              { label: 'Customer Emails', value: eventStats.cleanCustomerEmailsCount, iconKey: 'users' },
            ]
          : crossEventAnalytics
          ? [
              { label: 'Customer Emails', value: crossEventAnalytics.totalUniqueCustomerEmails, iconKey: 'users' },
              { label: 'Active in 1 Event', value: `${crossEventAnalytics.oneEventCount} (${crossEventAnalytics.oneEventPercent}%)`, iconKey: 'photo' },
              { label: 'Active in 2 Events', value: `${crossEventAnalytics.twoEventsCount} (${crossEventAnalytics.twoEventsPercent}%)`, iconKey: 'photo' },
              { label: 'Active in 3+ Events', value: `${crossEventAnalytics.threeOrMoreEventsCount} (${crossEventAnalytics.threeOrMoreEventsPercent}%)`, iconKey: 'photo' },
            ]
          : undefined
      }
      toolbarFilters={
        bucket || eventId || from || to
          ? [
              ...(bucket ? [{ label: 'Bucket', value: bucket }] : []),
              ...(eventId
                ? [
                    {
                      label: 'Event',
                      value: eventScope.eventName ?? eventId,
                      // Drop only the event scope, keep bucket/date filters.
                      removeHref: `/admin/tryon/analytics?${new URLSearchParams({
                        ...(bucket ? { bucket } : {}),
                        ...(from ? { from } : {}),
                        ...(to ? { to } : {}),
                      }).toString()}`,
                    },
                  ]
                : []),
              ...(from ? [{ label: 'From', value: from }] : []),
              ...(to ? [{ label: 'To', value: to }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{
        href: eventId
          ? `/admin/tryon/vetting?eventId=${encodeURIComponent(eventScope.eventId ?? eventId)}`
          : '/admin/tryon/vetting',
        label: 'Open Vetting',
      }}
      dbError={dbError}
    >
      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}
      {analytics ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
          <TryOnAnalyticsFilterForm bucket={bucket} eventId={eventId} from={from} to={to} />
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>
            Reporting over {analytics.scannedResultCount} archived try-on decision{analytics.scannedResultCount === 1 ? '' : 's'}.
          </p>
          <TryOnAnalyticsExportControls
            bucket={bucket}
            eventId={eventId}
            from={from}
            to={to}
            sections={[
              {
                key: 'all',
                label: 'All sections',
                description: 'Full operational export with every analytics table and chart source.',
                available: analytics.scannedResultCount > 0,
              },
              {
                key: 'funnel',
                label: 'Funnel',
                description: 'Pipeline counts from submitted through failed and superseded reruns.',
                available: analytics.funnel.submitted > 0 || analytics.funnel.failed > 0,
              },
              {
                key: 'hourly',
                label: 'Hourly outcomes',
                description: 'Hour-by-hour approved, declined, service, and failed totals.',
                available: analytics.hourlyOutcomes.length > 0,
              },
              {
                key: 'preset',
                label: 'By preset',
                description: 'Moderation outcomes grouped by try-on preset.',
                available: analytics.byPreset.length > 0,
              },
              {
                key: 'preset_performance',
                label: 'Preset performance',
                description: 'Preset throughput, retry, timeout, and approval diagnostics.',
                available: analytics.presetPerformance.length > 0,
              },
              {
                key: 'garment',
                label: 'By garment',
                description: 'Moderation outcomes grouped by leather suit catalog entry.',
                available: analytics.byGarment.length > 0,
              },
              {
                key: 'event',
                label: 'By event',
                description: 'Moderation outcomes grouped by event.',
                available: analytics.byEvent.length > 0,
              },
            ]}
          />
          <TryOnFunnelChart funnel={analytics.funnel} />
          <HourlyOutcomeChart rows={analytics.hourlyOutcomes} />
          <TryOnAnalyticsTables
            byPreset={analytics.byPreset}
            byGarment={analytics.byGarment}
            byEvent={analytics.byEvent}
            presetPerformance={analytics.presetPerformance}
            crossEvent={crossEventAnalytics}
          />
        </div>
      ) : null}
    </AdminListPageShell>
  );
}
