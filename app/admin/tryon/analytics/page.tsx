import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import {
  collectTryOnAnalytics,
  type TryOnAnalyticsBucket,
} from '@/lib/tryon/analytics';
import HourlyOutcomeChart from '@/components/admin/HourlyOutcomeChart';
import TryOnAnalyticsTables from '@/components/admin/TryOnAnalyticsTables';

export const dynamic = 'force-dynamic';

function bucketParam(value: string): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

type ExportSection = 'all' | 'hourly' | 'preset' | 'garment' | 'event' | 'preset_performance';

function exportHref(
  format: 'csv' | 'json',
  params: { bucket: string; eventId: string; from: string; to: string; section?: ExportSection }
): string {
  const query = new URLSearchParams({ format });
  if (params.bucket) query.set('bucket', params.bucket);
  if (params.eventId) query.set('eventId', params.eventId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.section && params.section !== 'all') query.set('section', params.section);
  return `/api/admin/tryon-analytics/export?${query.toString()}`;
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
  let dbError = null;

  try {
    const db = await connectToDatabase();
    analytics = await collectTryOnAnalytics(db, {
      bucket,
      eventId: eventId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
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
              { label: 'Approved', value: analytics.totals.approved, iconKey: 'photo' },
              { label: 'Rejected', value: analytics.totals.rejected, iconKey: 'photo' },
              { label: 'Service', value: analytics.totals.service, iconKey: 'photo' },
              { label: 'Greatest', value: analytics.totals.greatest, iconKey: 'world' },
            ]
          : undefined
      }
      toolbarFilters={
        [
          ...(bucket ? [{ label: 'Bucket', value: bucket }] : []),
          ...(eventId ? [{ label: 'Event', value: eventId }] : []),
          ...(from ? [{ label: 'From', value: from }] : []),
          ...(to ? [{ label: 'To', value: to }] : []),
        ].length
          ? [
              ...(bucket ? [{ label: 'Bucket', value: bucket }] : []),
              ...(eventId ? [{ label: 'Event', value: eventId }] : []),
              ...(from ? [{ label: 'From', value: from }] : []),
              ...(to ? [{ label: 'To', value: to }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{ href: '/admin/tryon-results', label: 'Open Vetting' }}
      dbError={dbError}
    >
      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}
      {analytics ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>
            Reporting over {analytics.scannedResultCount} archived try-on decision{analytics.scannedResultCount === 1 ? '' : 's'}.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-sm)' }}>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'all' })}>
              Export All (CSV)
            </a>
            <a href={exportHref('json', { bucket, eventId, from, to, section: 'all' })}>
              Export All (JSON)
            </a>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'hourly' })}>
              Export Hourly
            </a>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'preset' })}>
              Export By Preset
            </a>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'garment' })}>
              Export By Garment
            </a>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'event' })}>
              Export By Event
            </a>
            <a href={exportHref('csv', { bucket, eventId, from, to, section: 'preset_performance' })}>
              Export Preset Performance
            </a>
          </div>
          <HourlyOutcomeChart rows={analytics.hourlyOutcomes} />
          <TryOnAnalyticsTables
            byPreset={analytics.byPreset}
            byGarment={analytics.byGarment}
            byEvent={analytics.byEvent}
            presetPerformance={analytics.presetPerformance}
          />
        </div>
      ) : null}
    </AdminListPageShell>
  );
}
