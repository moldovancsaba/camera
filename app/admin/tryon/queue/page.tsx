import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/gds/AdminListPageShell';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import { Text, Group } from '@/components/gds/ui';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

type QueueStatusFilter =
  | ''
  | 'queued'
  | 'claimed'
  | 'processing'
  | 'uploading_result'
  | 'retry_wait'
  | 'done'
  | 'failed';

function toneForStatus(status: string): 'active' | 'inactive' | 'info' | 'warning' | 'danger' {
  switch (status) {
    case 'done':
      return 'active';
    case 'failed':
      return 'danger';
    case 'retry_wait':
      return 'warning';
    case 'queued':
    case 'claimed':
    case 'processing':
    case 'uploading_result':
      return 'info';
    default:
      return 'inactive';
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export default async function AdminTryOnQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const statusFilter = (typeof resolvedSearchParams?.status === 'string' ? resolvedSearchParams.status.trim() : '') as QueueStatusFilter;
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  let rows: Array<TryOnJob & { jobId: string }> = [];
  let dbError = null;

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (statusFilter) {
      query.status = statusFilter;
    }

    if (search) {
      query.$or = [
        { jobId: { $regex: search, $options: 'i' } },
        { 'source.submissionId': { $regex: search, $options: 'i' } },
        { 'request.leatherSuitId': { $regex: search, $options: 'i' } },
        { 'source.imageUrl': { $regex: search, $options: 'i' } },
      ];
    }

    rows = (await db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()) as Array<TryOnJob & { jobId: string }>;
  } catch (error) {
    console.error('Error loading try-on queue:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Queue"
      description="Live queue state from Atlas. This is the actual operational status of try-on jobs before moderation."
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        !dbError
          ? [
              { label: 'Jobs Loaded', value: rows.length, iconKey: 'photoScan' },
              { label: 'Queued', value: rows.filter((row) => row.status === 'queued').length, iconKey: 'photo' },
              { label: 'Retry Wait', value: rows.filter((row) => row.status === 'retry_wait').length, iconKey: 'photo' },
              { label: 'Failed', value: rows.filter((row) => row.status === 'failed').length, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search job id, submission id, suit id, or source image URL',
        clearHref: statusFilter ? `/admin/tryon/queue?status=${encodeURIComponent(statusFilter)}` : '/admin/tryon/queue',
        hiddenFields: statusFilter ? { status: statusFilter } : undefined,
      }}
      toolbarFilters={statusFilter ? [{ label: 'Status', value: formatStatusLabel(statusFilter) }] : undefined}
      toolbarTrailing={{ href: '/admin/tryon/queue?status=retry_wait', label: 'Retrying only' }}
      dbError={dbError}
    >
      <DataTable
        columns={[
          { key: 'job', title: 'Job' },
          { key: 'status', title: 'Status' },
          { key: 'source', title: 'Source' },
          { key: 'suit', title: 'Leather Jersey' },
          { key: 'worker', title: 'Worker' },
          { key: 'result', title: 'Result' },
        ]}
      >
        {rows.map((row) => (
          <tr key={row.jobId} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Text fw={700}>{row.jobId}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Created {new Date(row.createdAt).toLocaleString()}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Submission {row.source.submissionId}
              </Text>
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Group gap="xs">
                <StatusBadge tone={toneForStatus(row.status)} label={formatStatusLabel(row.status)} />
              </Group>
              <Text size="xs" c="dimmed" mt={8}>
                Stage: {formatStatusLabel(row.stage)}
              </Text>
              {row.error?.message ? (
                <Text size="xs" c="red.7" mt={8}>
                  {row.error.message}
                </Text>
              ) : null}
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Text size="sm" lineClamp={2}>
                {row.source.imageUrl}
              </Text>
              {row.source.eventMongoId ? (
                <Text size="xs" c="dimmed" mt={4}>
                  Event {row.source.eventMongoId}
                </Text>
              ) : null}
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Text size="sm">{row.request.leatherSuitId}</Text>
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Text size="sm">{row.processing.workerId || 'Unclaimed'}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Attempts {row.processing.attemptCount}
              </Text>
              {row.processing.nextAttemptAt ? (
                <Text size="xs" c="dimmed" mt={4}>
                  Next {new Date(row.processing.nextAttemptAt).toLocaleString()}
                </Text>
              ) : null}
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              {row.result.publicResultUrl ? (
                <Text component={Link} href={row.result.publicResultUrl} target="_blank" size="sm" c="blue.7">
                  Open result
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  No result yet
                </Text>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </AdminListPageShell>
  );
}
