import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectTryOnAnalytics, type TryOnAnalyticsBucket } from '@/lib/tryon/analytics';

type ExportSection = 'all' | 'hourly' | 'preset' | 'garment' | 'event' | 'preset_performance';

function bucketParam(value: string | null): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

function sectionParam(value: string | null): ExportSection | '' {
  return value === 'hourly' || value === 'preset' || value === 'garment' || value === 'event' || value === 'preset_performance' || value === 'all'
    ? value
    : '';
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
  const format = searchParams.get('format') === 'json' ? 'json' : 'csv';
  const exportSection = sectionParam(searchParams.get('section'));
  const db = await connectToDatabase();
  const analytics = await collectTryOnAnalytics(db, {
    bucket: bucketParam(searchParams.get('bucket')),
    eventId: searchParams.get('eventId')?.trim() || undefined,
    from: searchParams.get('from')?.trim() || undefined,
    to: searchParams.get('to')?.trim() || undefined,
  });
  if (format === 'json') {
    const payload = exportSection === 'all' || exportSection === '' || exportSection === undefined
      ? analytics
      : exportSection === 'hourly'
        ? { hourlyOutcomes: analytics.hourlyOutcomes }
        : exportSection === 'preset'
          ? { byPreset: analytics.byPreset }
          : exportSection === 'garment'
            ? { byGarment: analytics.byGarment }
            : exportSection === 'event'
              ? { byEvent: analytics.byEvent }
              : { presetPerformance: analytics.presetPerformance };
    return NextResponse.json({ data: payload });
  }
  const sections: Array<{ key: string; headers: string[]; rows: unknown[][] }> = [];
  if (exportSection === '' || exportSection === 'all' || exportSection === 'hourly') {
    sections.push({
      key: 'hourly_outcomes',
      headers: ['hour', 'label', 'approved', 'declined', 'service', 'failed', 'total'],
      rows: analytics.hourlyOutcomes.map((row) => [
        row.hour, row.label, row.approved, row.rejected, row.service, row.failed, row.total,
      ]),
    });
  }
  if (exportSection === '' || exportSection === 'all' || exportSection === 'preset_performance') {
    sections.push({
      key: 'preset_performance',
      headers: ['preset', 'jobs', 'done', 'failed', 'retry', 'timeouts', 'approved', 'declined', 'service', 'great', 'approval_rate'],
      rows: analytics.presetPerformance.map((row) => [
        row.setupName, row.jobs, row.done, row.failed, row.retryWait, row.providerTimeouts, row.approved, row.rejected, row.service, row.great, row.approvalRate,
      ]),
    });
  }
  if (exportSection === '' || exportSection === 'all' || exportSection === 'garment') {
    sections.push({
      key: 'by_garment',
      headers: ['garment', 'total', 'approved', 'declined', 'service', 'greatest'],
      rows: analytics.byGarment.map((row) => [
        row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
      ]),
    });
  }
  if (exportSection === '' || exportSection === 'all' || exportSection === 'event') {
    sections.push({
      key: 'by_event',
      headers: ['event', 'total', 'approved', 'declined', 'service', 'greatest'],
      rows: analytics.byEvent.map((row) => [
        row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
      ]),
    });
  }
  if (exportSection === '' || exportSection === 'all' || exportSection === 'preset') {
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
      'Content-Disposition': `attachment; filename="tryon-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
