import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { listActiveTryOnSetups, type TryOnSetup } from '@/lib/tryon/setup-resolution';
import { listActiveTryOnSuitOptions, type TryOnSuitOption } from '@/lib/tryon/suits';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import TryOnQueueTable, { type QueueRow } from '@/components/admin/TryOnQueueTable';
import { buildTryOnQueueStatusCountsQuery } from '@/lib/tryon/queue-status';
import { resolveEventNamesByMongoId } from '@/lib/tryon/event-names';
import { resolveTryOnAnalyticsEventScope, type TryOnAnalyticsEventScope } from '@/lib/tryon/analytics';
import EventPicker from '@/components/admin/EventPicker';

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
      code: typeof job.error?.code === 'string' ? job.error.code : null,
      message: typeof job.error?.message === 'string' ? job.error.message : null,
    },
  };
}

export default async function AdminTryOnQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; search?: string; eventId?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const statusFilter = (typeof resolvedSearchParams?.status === 'string' ? resolvedSearchParams.status.trim() : '') as QueueStatusFilter;
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const rawEventId = typeof resolvedSearchParams?.eventId === 'string' ? resolvedSearchParams.eventId.trim() : '';

  let rows: QueueRow[] = [];
  let dbError = null;
  let setupOptions: TryOnSetup[] = [];
  let suitOptions: TryOnSuitOption[] = [];
  let totalJobCount = 0;
  let queuedJobCount = 0;
  let retryWaitJobCount = 0;
  let failedJobCount = 0;
  let eventScope: TryOnAnalyticsEventScope = {};
  let eventId = rawEventId;

  try {
    const db = await connectToDatabase();
    setupOptions = await listActiveTryOnSetups(db);
    suitOptions = await listActiveTryOnSuitOptions(db);

    // Same dual-namespace resolution vetting and analytics already use --
    // queue links can arrive with either the event UUID or its Mongo _id.
    if (rawEventId) {
      eventScope = await resolveTryOnAnalyticsEventScope(db, rawEventId);
      eventId = eventScope.eventId ?? rawEventId;
    }

    const query: Record<string, unknown> = {};

    if (statusFilter) {
      query.status = statusFilter;
    }

    if (eventScope.eventMongoId) {
      query['source.eventMongoId'] = eventScope.eventMongoId;
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

    const [jobs, totalJobs, queuedJobs, retryWaitJobs, failedJobs] = await Promise.all([
      db
        .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments(query),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments(buildTryOnQueueStatusCountsQuery(query, 'queued')),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments(buildTryOnQueueStatusCountsQuery(query, 'retry_wait')),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments(buildTryOnQueueStatusCountsQuery(query, 'failed')),
    ]);

    rows = jobs.map(toQueueRow).filter((row): row is QueueRow => Boolean(row));
    const eventNames = await resolveEventNamesByMongoId(db, rows.map((row) => row.source.eventMongoId));
    rows = rows.map((row) =>
      row.source.eventMongoId && eventNames.has(row.source.eventMongoId)
        ? { ...row, source: { ...row.source, eventName: eventNames.get(row.source.eventMongoId) ?? null } }
        : row
    );
    totalJobCount = totalJobs;
    queuedJobCount = queuedJobs;
    retryWaitJobCount = retryWaitJobs;
    failedJobCount = failedJobs;
  } catch (error) {
    console.error('Error loading try-on queue:', error);
    dbError = serializeMongoError(error);
  }

  // Every link this page emits carries the active event scope forward, the
  // same convention vetting uses so "Retrying only" and search don't silently
  // drop an operator back into the all-events queue.
  const queueHref = (params: Record<string, string> = {}, { includeEvent = true } = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value);
    }
    if (includeEvent && eventId) qs.set('eventId', eventId);
    const suffix = qs.toString();
    return suffix ? `/admin/tryon/queue?${suffix}` : '/admin/tryon/queue';
  };
  const eventRemoveHref = queueHref(statusFilter ? { status: statusFilter } : {}, { includeEvent: false });

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Queue"
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        !dbError
          ? [
              { label: 'Matching Jobs', value: totalJobCount, iconKey: 'photoScan' },
              { label: 'Queued', value: queuedJobCount, iconKey: 'photo' },
              { label: 'Retry Wait', value: retryWaitJobCount, iconKey: 'photo' },
              { label: 'Failed', value: failedJobCount, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search job id, submission id, garment id, setup id, or source image URL',
        clearHref: queueHref(statusFilter ? { status: statusFilter } : {}),
        hiddenFields: {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(eventId ? { eventId } : {}),
        },
      }}
      toolbarFilters={
        statusFilter || eventId
          ? [
              ...(statusFilter ? [{ label: 'Status', value: formatStatusLabel(statusFilter) }] : []),
              ...(eventId ? [{ label: 'Event', value: eventScope.eventName ?? eventId, removeHref: eventRemoveHref }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{ href: queueHref({ status: 'retry_wait' }), label: 'Retrying only' }}
      beforeToolbar={!eventId ? <EventPicker basePath="/admin/tryon/queue" /> : undefined}
      dbError={dbError}
    >
      <TryOnQueueTable rows={rows} setupOptions={setupOptions} suitOptions={suitOptions} totalCount={totalJobCount} statusFilter={statusFilter} search={search} eventId={eventId} />
    </AdminListPageShell>
  );
}
