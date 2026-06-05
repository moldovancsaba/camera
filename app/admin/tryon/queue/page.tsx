import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { listActiveTryOnSetups, type TryOnSetup } from '@/lib/tryon/setup-resolution';
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

function toQueueRow(job: Partial<TryOnJob>): QueueRow | null {
  if (typeof job.jobId !== 'string' || !job.jobId.trim()) return null;
  if (typeof job.status !== 'string' || !job.status.trim()) return null;
  if (typeof job.stage !== 'string' || !job.stage.trim()) return null;

  return {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : '',
    source: {
      submissionId: typeof job.source?.submissionId === 'string' ? job.source.submissionId : 'unknown',
      imageUrl: typeof job.source?.imageUrl === 'string' ? job.source.imageUrl : '',
      eventMongoId: typeof job.source?.eventMongoId === 'string' ? job.source.eventMongoId : null,
    },
    request: {
      leatherSuitId:
        typeof job.request?.leatherSuitId === 'string' ? job.request.leatherSuitId : 'unknown',
      setupId:
        typeof job.request?.setupId === 'string' && job.request.setupId.trim().length > 0
          ? job.request.setupId
          : null,
    },
    processing: {
      workerId: typeof job.processing?.workerId === 'string' ? job.processing.workerId : null,
      attemptCount:
        typeof job.processing?.attemptCount === 'number' && Number.isFinite(job.processing.attemptCount)
          ? job.processing.attemptCount
          : 0,
      nextAttemptAt:
        typeof job.processing?.nextAttemptAt === 'string' ? job.processing.nextAttemptAt : null,
      resolvedSetup:
        typeof job.processing?.resolvedSetup?.setupId === 'string' &&
        typeof job.processing.resolvedSetup.setupName === 'string'
          ? {
              setupId: job.processing.resolvedSetup.setupId,
              setupName: job.processing.resolvedSetup.setupName,
            }
          : undefined,
    },
    result: {
      publicResultUrl:
        typeof job.result?.publicResultUrl === 'string' ? job.result.publicResultUrl : null,
    },
    error: {
      message: typeof job.error?.message === 'string' ? job.error.message : null,
    },
  };
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
  let setupOptions: TryOnSetup[] = [];

  try {
    const db = await connectToDatabase();
    setupOptions = await listActiveTryOnSetups(db);

    const query: Record<string, unknown> = {};

    if (statusFilter) {
      query.status = statusFilter;
    }

    if (search) {
      query.$or = [
        { jobId: { $regex: search, $options: 'i' } },
        { 'source.submissionId': { $regex: search, $options: 'i' } },
        { 'request.leatherSuitId': { $regex: search, $options: 'i' } },
        { 'request.setupId': { $regex: search, $options: 'i' } },
        { 'source.imageUrl': { $regex: search, $options: 'i' } },
      ];
    }

    const jobs = await db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    rows = jobs.map(toQueueRow).filter((row): row is QueueRow => Boolean(row));
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
        placeholder: 'Search job id, submission id, suit id, setup id, or source image URL',
        clearHref: statusFilter ? `/admin/tryon/queue?status=${encodeURIComponent(statusFilter)}` : '/admin/tryon/queue',
        hiddenFields: statusFilter ? { status: statusFilter } : undefined,
      }}
      toolbarFilters={statusFilter ? [{ label: 'Status', value: formatStatusLabel(statusFilter) }] : undefined}
      toolbarTrailing={{ href: '/admin/tryon/queue?status=retry_wait', label: 'Retrying only' }}
      dbError={dbError}
    >
      <TryOnQueueTable rows={rows} setupOptions={setupOptions} />
    </AdminListPageShell>
  );
}
