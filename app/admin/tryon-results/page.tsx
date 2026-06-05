import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type Submission, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import TryOnResultModerationTable, { type ModerationRow } from '@/components/admin/TryOnResultModerationTable';
import TryOnQueueTable, { type QueueRow } from '@/components/admin/TryOnQueueTable';
import { listActiveTryOnSetups, type TryOnSetup } from '@/lib/tryon/setup-resolution';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

export const dynamic = 'force-dynamic';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function normalizeDisplayName(value: string | null | undefined): string {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized && normalized.toLowerCase() !== 'event guest') {
      return normalized;
    }
  }
  return 'Guest';
}

function toModerationSetup(job: TryOnJob | null | undefined): ModerationRow['setup'] {
  if (typeof job?.processing?.resolvedSetup?.setupId === 'string' && job.processing.resolvedSetup.setupId.trim()) {
    return {
      setupId: job.processing.resolvedSetup.setupId,
      setupName:
        typeof job.processing.resolvedSetup.setupName === 'string'
          ? job.processing.resolvedSetup.setupName
          : null,
      setupProfile:
        typeof job.processing.resolvedSetup.setupProfile === 'string'
          ? job.processing.resolvedSetup.setupProfile
          : null,
      setupSource:
        typeof job.processing.resolvedSetup.setupSource === 'string'
          ? job.processing.resolvedSetup.setupSource
          : null,
    };
  }

  if (typeof job?.request?.setupId === 'string' && job.request.setupId.trim()) {
    return {
      setupId: job.request.setupId.trim(),
      setupName: null,
      setupProfile: null,
      setupSource: null,
    };
  }

  return null;
}

export default async function AdminTryOnResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{ reviewStatus?: string; search?: string; archive?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const reviewStatus = typeof resolvedSearchParams?.reviewStatus === 'string' ? resolvedSearchParams.reviewStatus.trim() : '';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const archive = typeof resolvedSearchParams?.archive === 'string' ? resolvedSearchParams.archive.trim() : '';
  const archiveBucket = archive === 'approved' || archive === 'rejected' ? archive : '';

  let rows: ModerationRow[] = [];
  let dbError = null;
  let pendingCount = 0;
  let archivedApprovedCount = 0;
  let archivedRejectedCount = 0;
  let failedJobCount = 0;
  let failedJobRows: QueueRow[] = [];
  let setupOptions: TryOnSetup[] = [];

  try {
    const db = await connectToDatabase();
    setupOptions = await listActiveTryOnSetups(db);
    const query: Record<string, unknown> = {
      submissionKind: 'tryon_result',
    };
    if (archiveBucket) {
      query['tryOnModerationArchive.archived'] = true;
      query['tryOnModerationArchive.bucket'] = archiveBucket;
    } else {
      query['tryOnModerationArchive.archived'] = { $ne: true };
      query.reviewStatus = reviewStatus || 'pending_review';
    }
    if (archiveBucket && reviewStatus) {
      query.reviewStatus = reviewStatus;
    }
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { eventName: regex },
        { partnerName: regex },
        { tryOnLeatherSuitId: regex },
        { sourceJobId: regex },
      ];
    }

    const failedJobsQuery: Record<string, unknown> = { status: 'failed' };
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      failedJobsQuery.$or = [
        { jobId: regex },
        { 'source.submissionId': regex },
        { 'request.leatherSuitId': regex },
        { 'request.setupId': regex },
        { 'source.imageUrl': regex },
        { 'error.message': regex },
      ];
    }

    const [docs, pending, archivedApproved, archivedRejected, failedJobs, failedJobsTotal] = await Promise.all([
      db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray() as Promise<Array<Submission & { _id: { toString(): string } }>>,
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        reviewStatus: 'pending_review',
        'tryOnModerationArchive.archived': { $ne: true },
      }),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'approved',
      }),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'rejected',
      }),
      archiveBucket
        ? Promise.resolve([])
        : db
            .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
            .find(failedJobsQuery)
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(50)
            .toArray(),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments({ status: 'failed' }),
    ]);

    pendingCount = pending;
    archivedApprovedCount = archivedApproved;
    archivedRejectedCount = archivedRejected;
    failedJobCount = failedJobsTotal;
    failedJobRows = failedJobs.map(toQueueRow).filter((row): row is QueueRow => Boolean(row));

    const sourceObjectIds = docs
      .map((doc) => doc.sourceSubmissionId)
      .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
      .map((value) => new ObjectId(value));
    const sourceJobIds = Array.from(new Set(
      docs
        .map((doc) => doc.sourceJobId)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ));

    const sourceDocs = sourceObjectIds.length
      ? ((await db
          .collection<Submission>(COLLECTIONS.SUBMISSIONS)
          .find({ _id: { $in: sourceObjectIds } })
          .toArray()) as Array<Submission & { _id: { toString(): string } }>)
      : [];
    const sourceMap = new Map(sourceDocs.map((doc) => [doc._id.toString(), doc]));
    const sourceJobs = sourceJobIds.length
      ? await db
          .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
          .find({ jobId: { $in: sourceJobIds } })
          .toArray()
      : [];
    const sourceJobMap = new Map(sourceJobs.map((job) => [job.jobId, job]));

    rows = docs.map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : undefined;
      const sourceJob = doc.sourceJobId ? sourceJobMap.get(doc.sourceJobId) : undefined;
      return {
        id: doc._id.toString(),
        sourceJobId: doc.sourceJobId ?? null,
        imageUrl:
          normalizeImgbbDirectUrl(doc.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(doc.finalImageUrl ?? null) ??
          '',
        originalImageUrl:
          normalizeImgbbDirectUrl(source?.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(source?.finalImageUrl ?? null) ??
          null,
        userName: normalizeDisplayName(doc.userName),
        userEmail: doc.userEmail ?? '',
        eventName: doc.eventName ?? null,
        partnerName: doc.partnerName ?? null,
        tryOnLeatherSuitId: doc.tryOnLeatherSuitId ?? null,
        reviewStatus: doc.reviewStatus ?? 'pending_review',
        createdAt: doc.createdAt,
        approvedAt: doc.approvedAt ?? null,
        isShareVisible: Boolean(doc.isShareVisible),
        isSlideshowEligible: Boolean(doc.isSlideshowEligible),
        setup: toModerationSetup(sourceJob),
      };
    });
  } catch (error) {
    console.error('Error loading try-on moderation queue:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Vetting Queue"
      description={
        archiveBucket
          ? `Review archive for ${archiveBucket} try-on decisions. Approved items remain publishable; this archive only removes them from the active moderation queue.`
          : 'Review generated leather results before they become share-visible or slideshow-eligible.'
      }
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        !dbError
          ? [
              { label: 'Pending Review', value: pendingCount, iconKey: 'photoScan' },
              { label: 'Failed Jobs', value: failedJobCount, iconKey: 'photo' },
              { label: 'Archived Approved', value: archivedApprovedCount, iconKey: 'world' },
              { label: 'Archived Rejected', value: archivedRejectedCount, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search by user, email, event, partner, suit, or job',
        clearHref: archiveBucket ? `/admin/tryon-results?archive=${archiveBucket}` : '/admin/tryon-results',
        hiddenFields: {
          ...(reviewStatus ? { reviewStatus } : {}),
          ...(archiveBucket ? { archive: archiveBucket } : {}),
        },
      }}
      toolbarHint={
        archiveBucket
          ? 'Search archived try-on decisions or return to the active review queue.'
          : 'Search the queue directly or jump to the pending-only review view.'
      }
      toolbarFilters={
        [
          ...(archiveBucket ? [{ label: 'Archive', value: archiveBucket }] : []),
          ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
          ...(search ? [{ label: 'Search', value: search }] : []),
        ].length > 0
          ? [
              ...(archiveBucket ? [{ label: 'Archive', value: archiveBucket }] : []),
              ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
              ...(search ? [{ label: 'Search', value: search }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{
        href: archiveBucket
          ? '/admin/tryon-results'
          : search
            ? `/admin/tryon-results?reviewStatus=pending_review&search=${encodeURIComponent(search)}`
            : '/admin/tryon-results?reviewStatus=pending_review',
        label: archiveBucket ? 'Active queue' : 'Pending only',
      }}
      dbError={dbError}
    >
      <ConsumerDashboardGrid columns={3}>
        {[
          {
            href: '/admin/tryon-results',
            title: `Active Queue (${pendingCount})`,
            description: 'Open the live moderation queue for pending try-on results.',
            iconKey: 'photoScan' as AdminIconKey,
          },
          {
            href: '/admin/tryon-results?failed=1',
            title: `Failed Jobs (${failedJobCount})`,
            description: 'Review failed try-on jobs, inspect their failure reason, and send them back to the worker.',
            iconKey: 'photo' as AdminIconKey,
          },
          {
            href: '/admin/tryon-results?archive=approved',
            title: `Archived Approved (${archivedApprovedCount})`,
            description: 'Browse approved items that were archived out of the active vetting queue.',
            iconKey: 'world' as AdminIconKey,
          },
          {
            href: '/admin/tryon-results?archive=rejected',
            title: `Archived Rejected (${archivedRejectedCount})`,
            description: 'Browse declined items that were archived out of the active vetting queue.',
            iconKey: 'photo' as AdminIconKey,
          },
        ].map((item) => (
          <ProductCard
            key={item.href}
            title={item.title}
            description={item.description}
            icon={<AdminIcon iconKey={item.iconKey} size={20} />}
            primaryAction={
              <a href={item.href} style={{ textDecoration: 'none' }}>
                Open
              </a>
            }
          />
        ))}
      </ConsumerDashboardGrid>
      {!archiveBucket && failedJobRows.length > 0 ? (
        <TryOnQueueTable rows={failedJobRows} setupOptions={setupOptions} />
      ) : null}
      <TryOnResultModerationTable
        rows={rows}
        setupOptions={setupOptions}
        emptyTitle={archiveBucket ? `No archived ${archiveBucket} try-on results` : undefined}
        emptyDescription={
          archiveBucket
            ? `Approved or rejected try-on results will appear here after they are archived out of the live moderation queue.`
            : undefined
        }
      />
    </AdminListPageShell>
  );
}
