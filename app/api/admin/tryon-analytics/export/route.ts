import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectTryOnAnalytics, type TryOnAnalyticsBucket } from '@/lib/tryon/analytics';

function bucketParam(value: string | null): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
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
  const db = await connectToDatabase();
  const analytics = await collectTryOnAnalytics(db, {
    bucket: bucketParam(searchParams.get('bucket')),
    eventId: searchParams.get('eventId')?.trim() || undefined,
    from: searchParams.get('from')?.trim() || undefined,
    to: searchParams.get('to')?.trim() || undefined,
  });
  if (format === 'json') {
    return NextResponse.json({ data: analytics });
  }
  const body = [
    section('hourly_outcomes', ['hour', 'label', 'approved', 'declined', 'service', 'failed', 'total'], analytics.hourlyOutcomes.map((row) => [
      row.hour, row.label, row.approved, row.rejected, row.service, row.failed, row.total,
    ])),
    section('preset_performance', ['preset', 'jobs', 'done', 'failed', 'retry', 'timeouts', 'approved', 'declined', 'service', 'great', 'approval_rate'], analytics.presetPerformance.map((row) => [
      row.setupName, row.jobs, row.done, row.failed, row.retryWait, row.providerTimeouts, row.approved, row.rejected, row.service, row.great, row.approvalRate,
    ])),
    section('by_garment', ['garment', 'total', 'approved', 'declined', 'service', 'greatest'], analytics.byGarment.map((row) => [
      row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
    ])),
    section('by_event', ['event', 'total', 'approved', 'declined', 'service', 'greatest'], analytics.byEvent.map((row) => [
      row.label, row.total, row.approved, row.rejected, row.service, row.greatest,
    ])),
  ].join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tryon-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
