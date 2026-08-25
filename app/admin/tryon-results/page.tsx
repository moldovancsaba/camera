import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type LeatherSuit, type Submission, type TryOnJob, type TryOnModerationEvent } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import OldestVettingResultCard from '@/components/admin/OldestVettingResultCard';
import TryOnResultModerationTable, { type ModerationRow } from '@/components/admin/TryOnResultModerationTable';
import TryOnQueueTable, { type QueueRow } from '@/components/admin/TryOnQueueTable';
import { listActiveTryOnSetups, type TryOnSetup } from '@/lib/tryon/setup-resolution';
import { listActiveTryOnSuitOptions, type TryOnSuitOption } from '@/lib/tryon/suits';
import { resolveTryOnAnalyticsEventScope, type TryOnAnalyticsEventScope } from '@/lib/tryon/analytics';
import { resolveEventNamesByMongoId } from '@/lib/tryon/event-names';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { ConsumerDashboardGrid, ProductCard } from '@/components/gds/ClientWrappers';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';
import { isActionableIdentityGap, resolveTryOnSubmissionIdentity } from '@/lib/tryon/identity';
import EventPicker from '@/components/admin/EventPicker';

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

function isTryOnGreat(metadata: Submission['metadata']): boolean {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      (metadata as Record<string, unknown>).tryOnGreat
  );
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
  searchParams?: Promise<{ reviewStatus?: string; search?: string; archive?: string; failed?: string; eventId?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const reviewStatus = typeof resolvedSearchParams?.reviewStatus === 'string' ? resolvedSearchParams.reviewStatus.trim() : '';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const rawEventId = typeof resolvedSearchParams?.eventId === 'string' ? resolvedSearchParams.eventId.trim() : '';
  const archive = typeof resolvedSearchParams?.archive === 'string' ? resolvedSearchParams.archive.trim() : '';
  const failed = typeof resolvedSearchParams?.failed === 'string' ? resolvedSearchParams.failed.trim() : '';
  const resultPageLimit = 24;
  const archiveBucket =
    archive === 'approved' ||
    archive === 'rejected' ||
    archive === 'service' ||
    archive === 'greatest' ||
    archive === 'superseded'
      ? archive
      : '';
  const failedJobsMode = failed === '1' || failed.toLowerCase() === 'true';
  const pageTitle = failedJobsMode
    ? 'Failed Try-On Jobs'
    : archiveBucket === 'greatest'
      ? 'Greatest Hits'
    : archiveBucket === 'approved'
      ? 'Approved'
      : archiveBucket === 'service'
        ? 'Service'
      : archiveBucket === 'rejected'
        ? 'Rejected'
      : archiveBucket === 'superseded'
        ? 'Superseded by Rerun'
        : 'Vetting';
  const pageStatus = failedJobsMode
    ? 'Failed Jobs'
    : archiveBucket === 'greatest'
      ? 'Greatest Hits'
    : archiveBucket === 'approved'
      ? 'Approved'
      : archiveBucket === 'service'
        ? 'Service'
      : archiveBucket === 'rejected'
      ? 'Rejected'
      : archiveBucket === 'superseded'
        ? 'Superseded'
        : 'Vetting';

  let rows: ModerationRow[] = [];
  let dbError = null;
  let pendingCount = 0;
  let archivedApprovedCount = 0;
  let archivedRejectedCount = 0;
  let archivedServiceCount = 0;
  let greatestHitsCount = 0;
  let archivedSupersededCount = 0;
  let failedJobCount = 0;
  let failedJobRows: QueueRow[] = [];
  let resultTotalCount = 0;
  let setupOptions: TryOnSetup[] = [];
  let suitOptions: TryOnSuitOption[] = [];
  let frameOptions: Array<{ frameId: string; name: string }> = [];
  let eventScope: TryOnAnalyticsEventScope = {};
  // Canonical UUID carried by every scoped link on this page; falls back to the
  // raw param so an unresolvable reference still round-trips instead of vanishing.
  let eventId = rawEventId;

  try {
    const db = await connectToDatabase();
    setupOptions = await listActiveTryOnSetups(db);
    suitOptions = await listActiveTryOnSuitOptions(db);
    // WHAT: Active frames for the "Change frame" picker on a result.
    // WHY: the `Frame` interface in lib/db/schemas.ts (ownershipLevel,
    // fileUrl, width/height) describes a frame model that was never actually
    // migrated to -- real documents (confirmed against production) have no
    // ownershipLevel and use imageUrl, not fileUrl, matching how
    // app/api/frames/route.ts itself already reads this collection: loosely
    // typed, not through the Frame interface. Only 10 frames exist total, so
    // showing every active one (rather than scoping by event) is a real,
    // complete picker, not a shortcut.
    frameOptions = (
      await db
        .collection(COLLECTIONS.FRAMES)
        .find({ isActive: true })
        .project({ frameId: 1, name: 1, imageUrl: 1 })
        .sort({ name: 1 })
        .toArray()
    ).flatMap((frame) =>
      typeof frame.frameId === 'string' && typeof frame.name === 'string' && typeof frame.imageUrl === 'string'
        ? [{ frameId: frame.frameId, name: frame.name }]
        : []
    );

    // WHAT: Resolve the incoming event reference (links historically carried
    // either the UUID or the Mongo _id) to both canonical keys plus the name.
    // WHY: Submissions are UUID-keyed and jobs are Mongo-id-keyed; resolving once
    // lets the list, every count tile, and the failed-jobs view all scope
    // correctly, and lets the filter chip show the event's name instead of a hex.
    if (rawEventId) {
      eventScope = await resolveTryOnAnalyticsEventScope(db, rawEventId);
      eventId = eventScope.eventId ?? rawEventId;
    }
    const eventRefs = [eventScope.eventId, eventScope.eventMongoId].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );
    const submissionEventClause =
      eventRefs.length > 0
        ? { $or: [{ eventId: { $in: eventRefs } }, { eventIds: { $elemMatch: { $in: eventRefs } } }] }
        : null;

    const query: Record<string, unknown> = {
      submissionKind: 'tryon_result',
    };
    if (archiveBucket === 'greatest') {
      query['tryOnModerationArchive.archived'] = true;
      query['tryOnModerationArchive.bucket'] = 'approved';
      query['metadata.tryOnGreat'] = true;
    } else if (archiveBucket === 'superseded') {
      query['tryOnModerationArchive.archived'] = true;
      query['tryOnModerationArchive.reason'] = 'quality_rerun_superseded';
    } else if (archiveBucket) {
      query['tryOnModerationArchive.archived'] = true;
      query['tryOnModerationArchive.bucket'] = archiveBucket;
      if (archiveBucket === 'rejected') {
        query['tryOnModerationArchive.reason'] = { $ne: 'quality_rerun_superseded' };
      }
    } else {
      query['tryOnModerationArchive.archived'] = { $ne: true };
      query.reviewStatus = reviewStatus || 'pending_review';
    }
    if (archiveBucket && reviewStatus) {
      query.reviewStatus = reviewStatus;
    }
    if (submissionEventClause) {
      query.$or = submissionEventClause.$or;
    }
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      const searchOr = [
        { userName: regex },
        { userEmail: regex },
        { eventName: regex },
        { partnerName: regex },
        { tryOnLeatherSuitId: regex },
        { sourceJobId: regex },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    const failedJobsQuery: Record<string, unknown> = { status: 'failed' };
    if (eventScope.eventMongoId) {
      failedJobsQuery['source.eventMongoId'] = eventScope.eventMongoId;
    }
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

    // WHAT: The event scope applied to every count tile below.
    // WHY: The tiles previously counted globally even while the list was
    // event-filtered — "Vetting (412)" above a 3-row scoped list. A tile's number
    // must describe the same universe as the list it links to.
    const scopedCount = (base: Record<string, unknown>): Record<string, unknown> =>
      submissionEventClause ? { ...base, ...submissionEventClause } : base;

    const [docs, resultTotal, pending, archivedApproved, archivedRejected, archivedService, greatestHits, archivedSuperseded, failedJobs, failedJobsTotal] = await Promise.all([
      db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .find(query)
        .sort(archiveBucket || failedJobsMode ? { createdAt: -1 } : { createdAt: 1 })
        .limit(resultPageLimit)
        .toArray() as Promise<Array<Submission & { _id: { toString(): string } }>>,
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(query),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        reviewStatus: 'pending_review',
        'tryOnModerationArchive.archived': { $ne: true },
      })),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'approved',
      })),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'rejected',
        'tryOnModerationArchive.reason': { $ne: 'quality_rerun_superseded' },
      })),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.reason': 'quality_rerun_superseded',
      })),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'service',
      })),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(scopedCount({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'approved',
        'metadata.tryOnGreat': true,
      })),
      failedJobsMode
        ? db
            .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
            .find(failedJobsQuery)
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(50)
            .toArray()
        : Promise.resolve([]),
      db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments({
        status: 'failed',
        ...(eventScope.eventMongoId ? { 'source.eventMongoId': eventScope.eventMongoId } : {}),
      }),
    ]);

    pendingCount = pending;
    archivedApprovedCount = archivedApproved;
    archivedRejectedCount = archivedRejected;
    archivedServiceCount = archivedService;
    greatestHitsCount = greatestHits;
    archivedSupersededCount = archivedSuperseded;
    failedJobCount = failedJobsTotal;
    resultTotalCount = resultTotal;
    failedJobRows = failedJobs.map(toQueueRow).filter((row): row is QueueRow => Boolean(row));
    if (failedJobRows.length > 0) {
      const eventNames = await resolveEventNamesByMongoId(
        db,
        failedJobRows.map((row) => row.source.eventMongoId)
      );
      failedJobRows = failedJobRows.map((row) =>
        row.source.eventMongoId && eventNames.has(row.source.eventMongoId)
          ? { ...row, source: { ...row.source, eventName: eventNames.get(row.source.eventMongoId) ?? null } }
          : row
      );
    }

    const sourceObjectIds = docs
      .map((doc) => doc.sourceSubmissionId)
      .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
      .map((value) => new ObjectId(value));
    const sourceJobIds = Array.from(new Set(
      docs
        .map((doc) => doc.sourceJobId)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ));
    const leatherSuitIds = Array.from(new Set(
      docs
        .map((doc) => doc.tryOnLeatherSuitId)
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
    const leatherSuits = leatherSuitIds.length
      ? await db
          .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
          .find({ leatherSuitId: { $in: leatherSuitIds } })
          .toArray()
      : [];
    const leatherSuitNameMap = new Map(leatherSuits.map((suit) => [suit.leatherSuitId, suit.name]));
    const resultIds = docs.map((doc) => doc._id.toString());
    const auditEvents = resultIds.length
      ? await db
          .collection<TryOnModerationEvent>(COLLECTIONS.TRYON_MODERATION_EVENTS)
          .find({ resultSubmissionId: { $in: resultIds } })
          .sort({ createdAt: -1 })
          .toArray()
      : [];
    const auditMap = new Map<string, TryOnModerationEvent[]>();
    for (const event of auditEvents) {
      const current = auditMap.get(event.resultSubmissionId) ?? [];
      if (current.length < 5) {
        current.push(event);
        auditMap.set(event.resultSubmissionId, current);
      }
    }

    rows = docs.map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : undefined;
      const sourceJob = doc.sourceJobId ? sourceJobMap.get(doc.sourceJobId) : undefined;
      const identity = resolveTryOnSubmissionIdentity(doc, source);
      return {
        id: doc._id.toString(),
        sourceJobId: doc.sourceJobId ?? null,
        imageUrl:
          normalizeImgbbDirectUrl(doc.finalImageUrl ?? null) ??
          normalizeImgbbDirectUrl(doc.imageUrl ?? null) ??
          '',
        previewImageUrl: normalizeImgbbDirectUrl(doc.previewImageUrl ?? null),
        originalImageUrl:
          normalizeImgbbDirectUrl(source?.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(source?.finalImageUrl ?? null) ??
          null,
        userName: identity.name,
        userEmail: identity.email ?? '',
        eventName: doc.eventName ?? null,
        partnerName: doc.partnerName ?? null,
        tryOnLeatherSuitId: doc.tryOnLeatherSuitId ?? null,
        tryOnLeatherSuitName: doc.tryOnLeatherSuitId ? leatherSuitNameMap.get(doc.tryOnLeatherSuitId) ?? null : null,
        reviewStatus: doc.reviewStatus ?? 'pending_review',
        createdAt: doc.createdAt,
        approvedAt: doc.approvedAt ?? null,
        isShareVisible: Boolean(doc.isShareVisible),
        isSlideshowEligible: Boolean(doc.isSlideshowEligible),
        isGreat: isTryOnGreat(doc.metadata),
        recentAudit: (auditMap.get(doc._id.toString()) ?? []).map((event) => ({
          eventId: event.eventId,
          action: event.action,
          actorEmail: event.actorEmail,
          createdAt: event.createdAt,
          reason: event.reason ?? null,
        })),
        setup: toModerationSetup(sourceJob),
        archiveReason: doc.tryOnModerationArchive?.reason ?? null,
        archiveSupersededByJobId: doc.tryOnModerationArchive?.supersededByJobId ?? null,
        archiveSupersededAt: doc.tryOnModerationArchive?.supersededAt ?? null,
        identityGapActionable: isActionableIdentityGap(doc, source),
      };
    });
  } catch (error) {
    console.error('Error loading try-on moderation queue:', error);
    dbError = serializeMongoError(error);
  }

  const oldestWaitingRow = !failedJobsMode && !archiveBucket ? rows[0] : null;

  // WHAT: Every link this page emits goes through here so the active event scope
  // survives navigation, on the canonical /admin/tryon/vetting path.
  // WHY: The previous hardcoded links (a) silently dropped ?eventId= on "Clear"
  // and "Pending only", dumping a scoped operator back into the all-events
  // firehose, and (b) pointed at the legacy /admin/tryon-results path, silently
  // URL-hopping anyone who entered via /admin/tryon/vetting.
  const vettingHref = (params: Record<string, string> = {}, { includeEvent = true } = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value);
    }
    if (includeEvent && eventId) qs.set('eventId', eventId);
    const suffix = qs.toString();
    return suffix ? `/admin/tryon/vetting?${suffix}` : '/admin/tryon/vetting';
  };
  // The chip's × drops only the event scope, keeping every other active filter.
  const eventRemoveHref = vettingHref(
    {
      ...(failedJobsMode ? { failed: '1' } : {}),
      ...(archiveBucket ? { archive: archiveBucket } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(search ? { search } : {}),
    },
    { includeEvent: false }
  );

  const activeFilterChips = [
    ...(failedJobsMode ? [{ label: 'Queue', value: 'failed jobs' }] : []),
    ...(archiveBucket ? [{ label: 'Archive', value: archiveBucket }] : []),
    ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
    ...(eventId
      ? [{ label: 'Event', value: eventScope.eventName ?? eventId, removeHref: eventRemoveHref }]
      : []),
    ...(search ? [{ label: 'Search', value: search }] : []),
  ];

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title={pageTitle}
      description={
        failedJobsMode
          ? 'Review failed try-on jobs, inspect their failure reason, and send them back to the worker.'
          : undefined
      }
      status={pageStatus}
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search by user, email, event, partner, garment, or job',
        clearHref: failedJobsMode
          ? vettingHref({ failed: '1' })
          : archiveBucket
            ? vettingHref({ archive: archiveBucket })
            : vettingHref(),
        hiddenFields: {
          ...(reviewStatus ? { reviewStatus } : {}),
          ...(eventId ? { eventId } : {}),
          ...(archiveBucket ? { archive: archiveBucket } : {}),
          ...(failedJobsMode ? { failed: '1' } : {}),
        },
      }}
      toolbarHint={
        failedJobsMode
          ? 'Search failed try-on jobs or return to the active review queue.'
          : archiveBucket
          ? 'Search archived try-on decisions or return to the active review queue.'
          : 'Search the queue directly or jump to the pending-only review view.'
      }
      toolbarFilters={activeFilterChips.length > 0 ? activeFilterChips : undefined}
      toolbarTrailing={{
        href: archiveBucket || failedJobsMode
          ? vettingHref()
          : vettingHref({ reviewStatus: 'pending_review', ...(search ? { search } : {}) }),
        label: archiveBucket || failedJobsMode ? 'Vetting' : 'Pending only',
      }}
      beforeToolbar={
        <>
          {!eventId ? <EventPicker basePath="/admin/tryon/vetting" /> : null}
          {oldestWaitingRow ? (
            <OldestVettingResultCard row={oldestWaitingRow} />
          ) : null}

          <ConsumerDashboardGrid columns={3}>
            {[
              {
                href: vettingHref(),
                title: `Vetting (${pendingCount})`,
                description: 'Open the live moderation queue for pending try-on results.',
                iconKey: 'photoScan' as AdminIconKey,
              },
              {
                href: vettingHref({ failed: '1' }),
                title: `Failed Jobs (${failedJobCount})`,
                description: 'Review failed try-on jobs, inspect their failure reason, and send them back to the worker.',
                iconKey: 'photo' as AdminIconKey,
              },
              {
                href: vettingHref({ archive: 'approved' }),
                title: `Approved (${archivedApprovedCount})`,
                description: 'Browse approved items that were archived out of the active vetting queue.',
                iconKey: 'world' as AdminIconKey,
              },
              {
                href: vettingHref({ archive: 'greatest' }),
                title: `Greatest Hits (${greatestHitsCount})`,
                description: 'Best-of selected approved try-on results for event highlights.',
                iconKey: 'world' as AdminIconKey,
              },
              {
                href: vettingHref({ archive: 'rejected' }),
                title: `Rejected (${archivedRejectedCount})`,
                description: 'Browse declined items that were archived out of the active vetting queue.',
                iconKey: 'photo' as AdminIconKey,
              },
              {
                href: vettingHref({ archive: 'superseded' }),
                title: `Superseded (${archivedSupersededCount})`,
                description: 'Quality reruns that replaced a prior result and left the active vetting queue.',
                iconKey: 'photo' as AdminIconKey,
              },
              {
                href: vettingHref({ archive: 'service' }),
                title: `Service (${archivedServiceCount})`,
                description: 'Browse service photos separated from rejected and approved analytics.',
                iconKey: 'photo' as AdminIconKey,
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-label={`Open ${item.title}`}
                style={{
                  background:
                    'linear-gradient(135deg, var(--mantine-color-violet-2), var(--mantine-color-cyan-1))',
                  borderRadius: 20,
                  boxShadow:
                    '0 14px 32px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent)',
                  color: 'inherit',
                  display: 'block',
                  padding: 2,
                  textDecoration: 'none',
                }}
              >
                <ProductCard
                  title={item.title}
                  description={item.description}
                  icon={<AdminIcon iconKey={item.iconKey} size={20} />}
                />
              </a>
            ))}
          </ConsumerDashboardGrid>
        </>
      }
      dbError={dbError}
    >
      {failedJobsMode ? (
        <TryOnQueueTable rows={failedJobRows} setupOptions={setupOptions} />
      ) : null}
      {!failedJobsMode ? (
        <TryOnResultModerationTable
          rows={rows}
          totalCount={resultTotalCount}
          setupOptions={setupOptions}
          suitOptions={suitOptions}
          frameOptions={frameOptions}
          listQuery={{
            reviewStatus: reviewStatus || (archiveBucket ? '' : 'pending_review'),
            archive: archiveBucket,
            eventId,
            search,
          }}
          autoRefresh={!archiveBucket && !failedJobsMode && !search}
          emptyTitle={archiveBucket ? `No ${archiveBucket === 'greatest' ? 'greatest hits' : archiveBucket} try-on results` : undefined}
          emptyDescription={
            archiveBucket
              ? archiveBucket === 'greatest'
                ? 'Great try-on results will appear here after an admin marks approved images as Great.'
                : archiveBucket === 'service'
                  ? 'Service photos will appear here after an admin marks images as Service.'
                  : `Approved or rejected try-on results will appear here after they are archived out of the live moderation queue.`
              : undefined
          }
        />
      ) : null}
    </AdminListPageShell>
  );
}
