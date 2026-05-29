import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import TryOnQueueTable, { type QueueRow } from '@/components/admin/TryOnQueueTable';

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

  let rows: QueueRow[] = [];
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
      .toArray()) as QueueRow[];
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
      <TryOnQueueTable rows={rows} />
    </AdminListPageShell>
  );
}
