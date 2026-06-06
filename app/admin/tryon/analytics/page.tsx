import { redirect } from 'next/navigation';
import { Stack, Text, Title } from '@mantine/core';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { collectTryOnAnalytics, type TryOnAnalyticsBucket, type TryOnAnalyticsRow } from '@/lib/tryon/analytics';

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
          <AnalyticsTable title="By Preset" rows={analytics.byPreset} />
          <AnalyticsTable title="By Garment" rows={analytics.byGarment} />
          <AnalyticsTable title="By Event" rows={analytics.byEvent} />
        </Stack>
      ) : null}
    </AdminListPageShell>
  );
}
