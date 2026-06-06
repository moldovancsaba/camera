import { redirect } from 'next/navigation';
import { Stack, Text, Title } from '@mantine/core';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import {
  collectTryOnAnalytics,
  type TryOnAnalyticsBucket,
  type TryOnHourlyOutcomeRow,
  type TryOnAnalyticsRow,
  type TryOnPresetPerformanceRow,
} from '@/lib/tryon/analytics';

export const dynamic = 'force-dynamic';

function bucketParam(value: string): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

function AnalyticsTable({ title, rows }: { title: string; rows: TryOnAnalyticsRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={3}>{title}</Title>
      {rows.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 680, width: '100%' }}>
            <thead>
              <tr>
                {['Name', 'Total', 'Approved', 'Rejected', 'Service', 'Greatest'].map((heading) => (
                  <th key={heading} scope="col" style={{ padding: 12, textAlign: heading === 'Name' ? 'left' : 'right' }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'left' }}>
                    {row.label}
                  </th>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.total}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.approved}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.rejected}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.service}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.greatest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Text c="dimmed">No try-on decisions match this filter.</Text>
      )}
    </Stack>
  );
}

function pct(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '0%';
  return `${Math.max(4, Math.round((value / total) * 1000) / 10)}%`;
}

function HourlyOutcomeChart({ rows }: { rows: TryOnHourlyOutcomeRow[] }) {
  const maxTotal = Math.max(1, ...rows.map((row) => row.total));
  const colors = {
    approved: 'var(--mantine-color-green-6)',
    rejected: 'var(--mantine-color-red-6)',
    service: 'var(--mantine-color-blue-6)',
    failed: 'var(--mantine-color-orange-6)',
  };

  return (
    <Stack gap="sm">
      <Title order={3}>Hourly Outcomes</Title>
      <Text c="dimmed" size="sm">
        Approved, declined, service, and failed images grouped by hour.
      </Text>
      {rows.length > 0 ? (
        <Stack gap="xs">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {[
              ['Approved', colors.approved],
              ['Declined', colors.rejected],
              ['Service', colors.service],
              ['Failed', colors.failed],
            ].map(([label, color]) => (
              <Text key={label} size="xs" c="dimmed">
                <span
                  aria-hidden
                  style={{
                    background: color,
                    borderRadius: 999,
                    display: 'inline-block',
                    height: 10,
                    marginRight: 6,
                    width: 10,
                  }}
                />
                {label}
              </Text>
            ))}
          </div>
          <Stack gap="sm">
            {rows.map((row) => (
              <div key={row.hour}>
                <div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Text size="sm" fw={700}>{row.label}</Text>
                  <Text size="xs" c="dimmed">
                    {row.total} total
                  </Text>
                </div>
                <div
                  aria-label={`${row.label}: approved ${row.approved}, declined ${row.rejected}, service ${row.service}, failed ${row.failed}`}
                  role="img"
                  style={{
                    background: 'var(--mantine-color-gray-1)',
                    borderRadius: 999,
                    display: 'flex',
                    height: 18,
                    marginTop: 6,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    width: `${Math.max(12, Math.round((row.total / maxTotal) * 100))}%`,
                  }}
                >
                  <div title={`Approved: ${row.approved}`} style={{ background: colors.approved, width: pct(row.approved, row.total) }} />
                  <div title={`Declined: ${row.rejected}`} style={{ background: colors.rejected, width: pct(row.rejected, row.total) }} />
                  <div title={`Service: ${row.service}`} style={{ background: colors.service, width: pct(row.service, row.total) }} />
                  <div title={`Failed: ${row.failed}`} style={{ background: colors.failed, width: pct(row.failed, row.total) }} />
                </div>
                <Text size="xs" c="dimmed" mt={4}>
                  Approved {row.approved} · Declined {row.rejected} · Service {row.service} · Failed {row.failed}
                </Text>
              </div>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Text c="dimmed">No hourly outcome data matches this filter.</Text>
      )}
    </Stack>
  );
}

function PresetPerformanceTable({ rows }: { rows: TryOnPresetPerformanceRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={3}>Preset Performance</Title>
      {rows.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 920, width: '100%' }}>
            <thead>
              <tr>
                {['Preset', 'Jobs', 'Done', 'Failed', 'Retry', 'Timeouts', 'Approved', 'Rejected', 'Service', 'Great', 'Approval Rate'].map((heading) => (
                  <th key={heading} scope="col" style={{ padding: 12, textAlign: heading === 'Preset' ? 'left' : 'right' }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.setupId}>
                  <th scope="row" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'left' }}>
                    {row.setupName}
                  </th>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.jobs}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.done}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.failed}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.retryWait}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.providerTimeouts}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.approved}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.rejected}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.service}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.great}</td>
                  <td style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 12, textAlign: 'right' }}>{row.approvalRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Text c="dimmed">No preset performance data matches this filter.</Text>
      )}
    </Stack>
  );
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
        <Stack gap="xl">
          <Text c="dimmed">
            Reporting over {analytics.scannedResultCount} archived try-on decision{analytics.scannedResultCount === 1 ? '' : 's'}.
          </Text>
          <HourlyOutcomeChart rows={analytics.hourlyOutcomes} />
          <PresetPerformanceTable rows={analytics.presetPerformance} />
          <AnalyticsTable title="By Preset" rows={analytics.byPreset} />
          <AnalyticsTable title="By Garment" rows={analytics.byGarment} />
          <AnalyticsTable title="By Event" rows={analytics.byEvent} />
        </Stack>
      ) : null}
    </AdminListPageShell>
  );
}
