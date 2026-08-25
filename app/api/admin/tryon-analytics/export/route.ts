import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectTryOnAnalytics, resolveTryOnAnalyticsEventScope, type TryOnAnalyticsBucket, type TryOnFunnelMetrics } from '@/lib/tryon/analytics';

type ExportSection = 'all' | 'hourly' | 'preset' | 'garment' | 'event' | 'preset_performance' | 'funnel';
type ExportFormat = 'csv' | 'json';

function bucketParam(value: string | null): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

function sectionParam(value: string | null): ExportSection | null {
  if (!value || value === 'all') return 'all';
  if (
    value === 'hourly' ||
    value === 'preset' ||
    value === 'garment' ||
    value === 'event' ||
    value === 'preset_performance' ||
    value === 'preset-performance' ||
    value === 'funnel'
  ) {
    return value === 'preset-performance' ? 'preset_performance' : value;
  }
  return null;
}

function funnelRows(funnel: TryOnFunnelMetrics): unknown[][] {
  return [
    ['submitted', funnel.submitted],
    ['queued', funnel.queued],
    ['processing', funnel.processing],
    ['generated', funnel.generated],
    ['approved', funnel.approved],
    ['declined', funnel.declined],
    ['service', funnel.service],
    ['superseded_rerun', funnel.supersededRerun],
    ['failed', funnel.failed],
  ];
}

function exportFilename(section: ExportSection, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const extension = format === 'json' ? 'json' : 'csv';
  return section === 'all'
    ? `tryon-analytics-all-${date}.${extension}`
    : `tryon-analytics-${section}-${date}.${extension}`;
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function section(title: string, headers: string[], rows: unknown[][]): string {
  return [
    title,
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
    '',
  ].join('\n');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }
  const { searchParams } = request.nextUrl;
  const format: ExportFormat = searchParams.get('format') === 'json' ? 'json' : 'csv';
  const rawSection = searchParams.get('section');
  const exportSection = sectionParam(rawSection);
  if (rawSection && exportSection === null) {
    throw apiBadRequest('Unsupported export section');
  }
  const resolvedSection = exportSection ?? 'all';
  const db = await connectToDatabase();
  // Resolve the event reference to both key namespaces (submissions: UUID,
  // jobs: Mongo _id) so neither half of the export silently filters to zero.
  const rawEventId = searchParams.get('eventId')?.trim() || '';
  const eventScope = rawEventId ? await resolveTryOnAnalyticsEventScope(db, rawEventId) : {};
  const analytics = await collectTryOnAnalytics(db, {
    bucket: bucketParam(searchParams.get('bucket')),
    eventId: eventScope.eventId ?? (rawEventId || undefined),
    eventMongoId: eventScope.eventMongoId,
    from: searchParams.get('from')?.trim() || undefined,
    to: searchParams.get('to')?.trim() || undefined,
  });
  if (format === 'json') {
    const payload =
      resolvedSection === 'all'
        ? analytics
        : resolvedSection === 'hourly'
          ? { hourlyOutcomes: analytics.hourlyOutcomes }
          : resolvedSection === 'preset'
            ? { byPreset: analytics.byPreset }
            : resolvedSection === 'garment'
              ? { byGarment: analytics.byGarment }
              : resolvedSection === 'event'
                ? { byEvent: analytics.byEvent }
                : resolvedSection === 'funnel'
                  ? { funnel: analytics.funnel, totals: analytics.totals }
                  : { presetPerformance: analytics.presetPerformance };
    return NextResponse.json(
      { data: payload },
      {
        headers: {
          'Content-Disposition': `attachment; filename="${exportFilename(resolvedSection, 'json')}"`,
        },
      }
    );
  }
  const sections: Array<{ key: string; headers: string[]; rows: unknown[][] }> = [];
  if (resolvedSection === 'all' || resolvedSection === 'hourly') {
    sections.push({
      key: 'hourly_outcomes',
      headers: ['hour', 'label', 'approved', 'declined', 'service', 'failed', 'total'],
      rows: analytics.hourlyOutcomes.map((row) => [
        row.hour, row.label, row.approved, row.rejected, row.service, row.failed, row.total,
      ]),
    });
  }
  if (resolvedSection === 'all' || resolvedSection === 'funnel') {
    sections.push({
      key: 'funnel',
      headers: ['stage', 'count'],
      rows: funnelRows(analytics.funnel),
    });
  }
  if (resolvedSection === 'all' || resolvedSection === 'preset_performance') {
    sections.push({
      key: 'preset_performance',
      headers: ['preset', 'jobs', 'done', 'failed', 'retry', 'timeouts', 'approved', 'declined', 'service', 'great', 'approval_rate'],
      rows: analytics.presetPerformance.map((row) => [
        row.setupName, row.jobs, row.done, row.failed, row.retryWait, row.providerTimeouts, row.approved, row.rejected, row.service, row.great, row.approvalRate,
      ]),
    });
  }
  if (resolvedSection === 'all' || resolvedSection === 'garment') {
    sections.push({
      key: 'by_garment',
      headers: ['garment', 'total', 'approved', 'declined', 'service', 'greatest'],
      rows: analytics.byGarment.map((row) => [
        row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
      ]),
    });
  }
  if (resolvedSection === 'all' || resolvedSection === 'event') {
    sections.push({
      key: 'by_event',
      headers: ['event', 'total', 'approved', 'declined', 'service', 'greatest'],
      rows: analytics.byEvent.map((row) => [
        row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
      ]),
    });
  }
  if (resolvedSection === 'all' || resolvedSection === 'preset') {
    sections.push({
      key: 'by_preset',
      headers: ['preset', 'total', 'approved', 'declined', 'service', 'greatest'],
      rows: analytics.byPreset.map((row) => [
        row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
      ]),
    });
  }
  const body = sections.map((chunk) => section(chunk.key, chunk.headers, chunk.rows)).join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(resolvedSection, 'csv')}"`,
    },
  });
});
