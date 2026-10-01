import { ObjectId, type Db, type WithId } from 'mongodb';
import {
  COLLECTIONS,
  type Event,
  type Submission,
  type TryOnJob,
} from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';
import { apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api';
import { detectImageProvider, normalizeImgbbDirectUrl } from '@/lib/imgbb/url';
import { buildDerivedTryOnSubmission, buildTryOnPublicationSummary, upsertSubmissionTryOnPublicationLink } from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { shouldApprovedTryOnBeSlideshowEligible } from '@/lib/tryon/slideshow-policy';
import {
  applyFrameToTryOnResult,
  inspectTryOnResultAsset,
  type TryOnResultAsset,
} from '@/lib/tryon/frame-composition';
import { dispatchPendingRelatedEmailForSubmission } from '@/lib/email/submission-result-email';
import { resolveTryOnSubmissionIdentity } from '@/lib/tryon/identity';
import { resolveCompletionReapplySource } from '@/lib/tryon/sync';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { validImageDirectCallbackCredential } from '@/lib/tryon/image-direct-callback';

type FrameRecord = {
  fileUrl?: string | null;
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

function resolveFrameAssetUrl(frame: FrameRecord): string | null {
  const legacyUrl = typeof frame.fileUrl === 'string' ? frame.fileUrl.trim() : '';
  if (legacyUrl) return legacyUrl;

  const currentUrl = typeof frame.imageUrl === 'string' ? frame.imageUrl.trim() : '';
  return currentUrl || null;
}

export interface TryOnCompletionPayload {
  publicResultUrl: string;
  deleteUrl?: string | null;
  workerId?: string | null;
  pipelineVersion?: string | null;
  forcePendingReview?: boolean;
}

export interface TryOnCompletionResult {
  action: 'created' | 'updated' | 'unchanged';
  sourceSubmissionId: string;
  resultSubmissionId: string | null;
  publicationStatus: 'pending_review' | 'approved' | 'rejected';
  publicationVisible: boolean;
}

function getPendingReviewState() {
  return {
    reviewStatus: 'pending_review' as const,
    shareVisible: false,
    slideshowEligible: false,
  };
}

function getCompositionReviewState(event: Pick<Event, 'tryOn'> | null) {
  if (event?.tryOn?.vettingEnabled === false) {
    return {
      reviewStatus: 'approved' as const,
      shareVisible: true,
      slideshowEligible: shouldApprovedTryOnBeSlideshowEligible(event),
    };
  }

  return getPendingReviewState();
}

function isAdminRerunJob(job: TryOnJob): boolean {
  return Boolean(job.request.rerunOfJobId) || job.requestHash.includes('::rerun:');
}

/**
 * Service-to-service auth for the try-on worker callbacks (complete / sync).
 * Accepts `x-camera-tryon-secret` or Bearer. Constant-time compare, fails
 * closed when CAMERA_TRYON_INTERNAL_SECRET is unset, and every rejection is a
 * bare 403 "Forbidden"; the reason goes to the server log only (see
 * lib/security/safeEqual.ts).
 */
export function assertInternalTryOnSecret(request: Request): void {
  const provided = request.headers.get('x-camera-tryon-secret')?.trim()
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    || '';

  const result = checkSharedSecret(process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim(), provided);
  if (result !== 'ok') {
    logSharedSecretRejection('try-on internal API', 'CAMERA_TRYON_INTERNAL_SECRET', result);
    throw apiForbidden();
  }
}

export function assertImageDirectCallbackSecret(request: Request): void {
  const provided = request.headers.get('x-camera-image-direct-callback-token')?.trim() || '';
  const configured = process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN?.trim();
  const previous = process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS?.trim();
  const currentCheck = configured && configured.length >= 32
    ? checkSharedSecret(configured, provided)
    : 'not_configured';
  if (!validImageDirectCallbackCredential(provided, configured, previous)) {
    logSharedSecretRejection(
      'image.direct completion',
      'CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN',
      configured ? currentCheck as Exclude<typeof currentCheck, 'ok'> : 'not_configured'
    );
    throw apiForbidden();
  }
}

async function resolveSourceEvent(
  db: Db,
  sourceSubmission: Submission,
  sourceJob: TryOnJob
): Promise<Pick<Event, 'tryOn'> | null> {
  const eventIdentifiers = new Set<string>();
  const sourceEventId = typeof sourceSubmission.eventId === 'string' ? sourceSubmission.eventId.trim() : '';

  if (sourceEventId) {
    eventIdentifiers.add(sourceEventId);
  }
  if (sourceJob.source.eventMongoId) {
    eventIdentifiers.add(String(sourceJob.source.eventMongoId));
  }
  if (Array.isArray(sourceSubmission.eventIds)) {
    sourceSubmission.eventIds.forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        eventIdentifiers.add(value.trim());
      }
    });
  }

  if (eventIdentifiers.size === 0) {
    return null;
  }

  const lookupClauses: Array<Record<string, unknown>> = [];
  for (const value of eventIdentifiers) {
    if (ObjectId.isValid(value)) {
      lookupClauses.push({ _id: new ObjectId(value) });
      lookupClauses.push({ eventId: value });
      continue;
    }

    lookupClauses.push({ eventId: value });
  }

  return db.collection<Event>(COLLECTIONS.EVENTS).findOne(
    { $or: lookupClauses },
    { projection: { tryOn: 1 } }
  );
}

/**
 * The derived result's current composed asset, when this completion
 * re-processes the same raw worker output that produced it.
 *
 * WHAT: Returns that asset exactly as stored on the derived submission when
 *     its metadata.tryOnRawResultUrl equals the incoming URL and the image it
 *     publishes is a different (composed) URL; otherwise null.
 * WHY: A re-application starts from the raw URL (CAM-02), so a frame is never
 *     composed onto an already-framed image. When no frame is composed on that
 *     run (the source has no frameId, applyFrameToReturnedResults is off, the
 *     frame record is gone, or the composite throws, e.g. while i.ibb.co is
 *     failing), the old fallback inspected the raw URL and published the
 *     unframed image over an approved, share-visible framed result. Keeping
 *     the stored asset makes such a run a no-op instead. Changing a result's
 *     frame on purpose is POST /api/admin/tryon-results/[submissionId]/reframe.
 */
function resolveRetainedComposedAsset(
  existing: Submission | null,
  rawResultUrl: string
): TryOnResultAsset | null {
  if (!existing) {
    return null;
  }

  const metadata = existing.metadata && typeof existing.metadata === 'object'
    ? existing.metadata as unknown as Record<string, unknown>
    : {};
  const storedRawUrl = typeof metadata.tryOnRawResultUrl === 'string' ? metadata.tryOnRawResultUrl.trim() : '';
  const publishedUrl = [existing.imageUrl, existing.finalImageUrl]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';

  if (!storedRawUrl || storedRawUrl !== rawResultUrl || !publishedUrl || publishedUrl === rawResultUrl) {
    return null;
  }

  return {
    publicResultUrl: publishedUrl,
    previewUrl: existing.previewImageUrl ?? null,
    deleteUrl: existing.deleteUrl ?? null,
    fileSize: typeof existing.fileSize === 'number' ? existing.fileSize : null,
    mimeType: typeof existing.mimeType === 'string' ? existing.mimeType : null,
    width: typeof metadata.finalWidth === 'number' ? metadata.finalWidth : null,
    height: typeof metadata.finalHeight === 'number' ? metadata.finalHeight : null,
    compositionEngine: typeof metadata.compositionEngine === 'string'
      ? metadata.compositionEngine
      : 'motogp_leather_magic_framed',
  };
}

async function resolveTryOnResultAsset(
  db: Db,
  sourceSubmission: Submission,
  publicResultUrl: string,
  event: Pick<Event, 'tryOn'> | null,
  retainedAsset: TryOnResultAsset | null
): Promise<TryOnResultAsset> {
  // Every branch that composes no frame lands here: the stored composed
  // asset when this is a re-application of the same raw output (see
  // resolveRetainedComposedAsset), else the incoming image as it is.
  const withoutFrame = () => retainedAsset ?? inspectTryOnResultAsset(publicResultUrl);

  const frameId = typeof sourceSubmission.frameId === 'string' && sourceSubmission.frameId.trim()
    ? sourceSubmission.frameId.trim()
    : null;

  if (!frameId) {
    return withoutFrame();
  }

  if (!event?.tryOn?.applyFrameToReturnedResults) {
    return withoutFrame();
  }

  const frame = await db.collection<FrameRecord>(COLLECTIONS.FRAMES).findOne(
    { frameId },
    { projection: { fileUrl: 1, imageUrl: 1, width: 1, height: 1 } }
  );

  const frameAssetUrl = frame ? resolveFrameAssetUrl(frame) : null;
  if (!frameAssetUrl) {
    return withoutFrame();
  }

  try {
    return await applyFrameToTryOnResult(
      publicResultUrl,
      frameAssetUrl,
      `tryon-framed-${Date.now()}`,
      frame?.width,
      frame?.height
    );
  } catch {
    console.error(
      retainedAsset
        ? 'Failed to apply frame to returned try-on result; keeping the current framed result.'
        : 'Failed to apply frame to returned try-on result; falling back to raw upload.',
      {
        eventId: sourceSubmission.eventId ?? null,
        frameId,
        errorCode: 'frame_composition_failed',
      }
    );
    return withoutFrame();
  }
}

function isUnchangedDerivedSubmission(
  existing: Submission,
  resolvedAsset: { publicResultUrl: string; previewUrl?: string | null; compositionEngine: string; width?: number | null; height?: number | null; fileSize?: number | null; mimeType?: string | null; deleteUrl: string | null; },
  resolvedRawResultUrl: string | null
): boolean {
  const existingMetadata = existing.metadata && typeof existing.metadata === 'object'
    ? existing.metadata
    : undefined;

  const existingFinalWidth =
    existingMetadata && typeof (existingMetadata as { finalWidth?: unknown }).finalWidth === 'number'
      ? (existingMetadata as { finalWidth: number }).finalWidth
      : null;
  const existingFinalHeight =
    existingMetadata && typeof (existingMetadata as { finalHeight?: unknown }).finalHeight === 'number'
      ? (existingMetadata as { finalHeight: number }).finalHeight
      : null;
  const existingRawResultUrl =
    existingMetadata &&
    typeof (existingMetadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl === 'string'
      ? (existingMetadata as { tryOnRawResultUrl: string }).tryOnRawResultUrl
      : null;
  const existingCompositionEngine =
    existingMetadata &&
    typeof (existingMetadata as { compositionEngine?: unknown }).compositionEngine === 'string'
      ? (existingMetadata as { compositionEngine: string }).compositionEngine
      : null;

  const existingFileSize = typeof existing.fileSize === 'number' ? existing.fileSize : null;
  const existingMimeType = typeof existing.mimeType === 'string' ? existing.mimeType : null;

  return (
    existing.imageUrl === resolvedAsset.publicResultUrl &&
    existing.finalImageUrl === resolvedAsset.publicResultUrl &&
    (existing.previewImageUrl ?? null) === (resolvedAsset.previewUrl ?? null) &&
    existing.deleteUrl === resolvedAsset.deleteUrl &&
    existingCompositionEngine === resolvedAsset.compositionEngine &&
    existingRawResultUrl === resolvedRawResultUrl &&
    existingFinalWidth === (resolvedAsset.width ?? null)
    && existingFinalHeight === (resolvedAsset.height ?? null)
    && existingFileSize === (resolvedAsset.fileSize ?? null)
    && existingMimeType === (resolvedAsset.mimeType ?? null)
  );
}

async function applyEmailMetadataPatch(
  db: Db,
  sourceSubmissionObjectId: ObjectId,
  metadataPatch: Record<string, unknown> | null | undefined
) {
  if (!metadataPatch || Object.keys(metadataPatch).length === 0) {
    return;
  }

  await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: sourceSubmissionObjectId },
    { $set: metadataPatch }
  );
}

export async function applyTryOnCompletion(
  db: Db,
  job: WithId<TryOnJob>,
  payload: TryOnCompletionPayload
): Promise<TryOnCompletionResult> {
  const publicResultUrl = normalizeImgbbDirectUrl(payload.publicResultUrl);
  if (!publicResultUrl) {
    throw apiBadRequest('publicResultUrl must be an http(s) image URL on *.ibb.co (direct image host, not the ibb.co viewer) or *.public.blob.vercel-storage.com -- see lib/imgbb/url.ts normalizeImgbbDirectUrl');
  }
  if (!ObjectId.isValid(job.source.submissionId)) {
    throw apiBadRequest('Try-on job source submission is invalid');
  }

  const sourceSubmissionObjectId = new ObjectId(job.source.submissionId);
  const sourceSubmission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: sourceSubmissionObjectId });

  if (!sourceSubmission) {
    throw apiNotFound('Source submission');
  }

  const sourceEvent = await resolveSourceEvent(db, sourceSubmission, job);
  const isRerunJob = isAdminRerunJob(job);
  const publication = payload.forcePendingReview || isRerunJob
    ? getPendingReviewState()
    : getCompositionReviewState(sourceEvent);
  // Read before the asset is resolved: a re-application of the same raw
  // output keeps this document's composed image when no frame is applied.
  const existingDerived = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ sourceJobId: job.jobId });
  const resolvedAsset = await resolveTryOnResultAsset(
    db,
    sourceSubmission,
    publicResultUrl,
    sourceEvent,
    resolveRetainedComposedAsset(existingDerived, publicResultUrl)
  );

  const now = nowIso();
  const existingRawResultUrl = typeof existingDerived?.metadata === 'object'
    ? (typeof (existingDerived.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl === 'string'
      ? existingDerived.metadata.tryOnRawResultUrl
      : null)
    : null;
  const hasFramedAsset = resolvedAsset.publicResultUrl !== publicResultUrl;
  const resolvedRawResultUrl = hasFramedAsset ? publicResultUrl : existingRawResultUrl ?? null;
  const sourceReviewState = existingDerived && !isRerunJob
    ? {
        reviewStatus: existingDerived.reviewStatus ?? publication.reviewStatus,
        shareVisible: Boolean(existingDerived.isShareVisible ?? publication.shareVisible),
        slideshowEligible: Boolean(existingDerived.isSlideshowEligible ?? publication.slideshowEligible),
      }
    : publication;
  const identity = resolveTryOnSubmissionIdentity(existingDerived ?? sourceSubmission, sourceSubmission);

  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId: job.jobId },
    {
      $set: {
        status: 'done',
        stage: 'done',
        updatedAt: now,
        'processing.finishedAt': now,
        'processing.leaseExpiresAt': null,
        'processing.lastHeartbeatAt': now,
        ...(payload.workerId ? { 'processing.workerId': payload.workerId } : {}),
        result: {
          publicResultUrl: resolvedAsset.publicResultUrl,
          imgbbDeleteUrl: resolvedAsset.deleteUrl ?? payload.deleteUrl ?? null,
          provider: detectImageProvider(resolvedAsset.publicResultUrl),
        },
        ...(payload.forcePendingReview && job.imageDirect?.result ? { 'imageDirect.result': job.imageDirect.result } : {}),
        error: {
          code: null,
          message: null,
          details: null,
        },
      },
    }
  );

  const derivedSet: Record<string, unknown> = {
    imageUrl: resolvedAsset.publicResultUrl,
    finalImageUrl: resolvedAsset.publicResultUrl,
    previewImageUrl: resolvedAsset.previewUrl ?? null,
    deleteUrl: resolvedAsset.deleteUrl ?? payload.deleteUrl ?? null,
    fileSize: resolvedAsset.fileSize ?? null,
    mimeType: resolvedAsset.mimeType ?? null,
    updatedAt: now,
    'metadata.compositionEngine': resolvedAsset.compositionEngine,
    'metadata.tryOnRawResultUrl': resolvedRawResultUrl ?? null,
    'metadata.finalWidth': resolvedAsset.width ?? null,
    'metadata.finalHeight': resolvedAsset.height ?? null,
    reviewStatus: sourceReviewState.reviewStatus,
    isShareVisible: sourceReviewState.shareVisible,
    isSlideshowEligible: sourceReviewState.slideshowEligible,
    sourceJobId: job.jobId,
    userName: identity.name,
    userEmail: identity.email ?? '',
    ...(identity.userInfo ? { userInfo: identity.userInfo } : {}),
  };

  if (sourceReviewState.reviewStatus === 'pending_review') {
    Object.assign(derivedSet, {
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      approvedAt: null,
      approvedBy: null,
      tryOnModerationArchive: {
        archived: false,
        bucket: null,
        archivedAt: null,
        archivedBy: null,
      },
    });
  }

  const pipelineVersion =
    payload.pipelineVersion?.trim() || job.pipelineVersion || null;

  if (existingDerived?._id) {
    const updated = !isUnchangedDerivedSubmission(existingDerived, resolvedAsset, resolvedRawResultUrl);
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: existingDerived._id },
      { $set: {
        ...derivedSet,
        tryOnPipeline: job.pipeline,
        tryOnPipelineVersion: pipelineVersion,
      } }
    );

    await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
      status: 'done',
      requested: true,
      requestedAt: sourceSubmission.tryOnRequest?.requestedAt ?? null,
      leatherSuitId: job.request.leatherSuitId,
      jobId: job.jobId,
      sourceImageUrl: job.source.imageUrl,
      sourceImageId: sourceSubmission.tryOnRequest?.sourceImageId,
      sourceDeleteUrl: sourceSubmission.tryOnRequest?.sourceDeleteUrl ?? null,
      resultUrl: resolvedAsset.publicResultUrl,
      resultDeleteUrl: resolvedAsset.deleteUrl ?? payload.deleteUrl ?? null,
      resultProvider: detectImageProvider(resolvedAsset.publicResultUrl),
      reviewStatus: sourceReviewState.reviewStatus,
      shareVisible: sourceReviewState.shareVisible,
      slideshowEligible: sourceReviewState.slideshowEligible,
      lastError: null,
    });

    await upsertSubmissionTryOnPublicationLink(
      db,
      sourceSubmissionObjectId,
      buildTryOnPublicationSummary(
        existingDerived._id.toString(),
        job.jobId,
        job.request.leatherSuitId,
        resolvedAsset.publicResultUrl,
        sourceReviewState.reviewStatus,
        sourceReviewState.shareVisible,
        sourceReviewState.slideshowEligible
      )
    );

    const relatedEmailResult = await dispatchPendingRelatedEmailForSubmission(db, sourceSubmission);
    await applyEmailMetadataPatch(db, sourceSubmissionObjectId, relatedEmailResult?.metadataPatch);

    return {
      action: updated ? 'updated' : 'unchanged',
      sourceSubmissionId: sourceSubmissionObjectId.toString(),
      resultSubmissionId: existingDerived._id.toString(),
      publicationStatus: sourceReviewState.reviewStatus,
      publicationVisible: sourceReviewState.shareVisible,
    };
  }

  const create = buildDerivedTryOnSubmission({
    sourceSubmission: {
      ...sourceSubmission,
      _id: sourceSubmissionObjectId,
    },
    job: {
      ...job,
      _id: job._id ?? new ObjectId(),
    },
    publicResultUrl: resolvedAsset.publicResultUrl,
    deleteUrl: resolvedAsset.deleteUrl ?? payload.deleteUrl ?? null,
    pipelineVersion,
    publication: {
      reviewStatus: publication.reviewStatus,
      shareVisible: publication.shareVisible,
      slideshowEligible: publication.slideshowEligible,
      reviewedBy: publication.reviewStatus === 'approved' ? 'system:auto-vetting-disabled' : null,
      approvedBy: publication.reviewStatus === 'approved' ? 'system:auto-vetting-disabled' : null,
      archive: publication.reviewStatus === 'approved',
    },
    resultImageMeta: {
      width: resolvedAsset.width ?? undefined,
      height: resolvedAsset.height ?? undefined,
      fileSize: resolvedAsset.fileSize ?? undefined,
      mimeType: resolvedAsset.mimeType ?? undefined,
      compositionEngine: resolvedAsset.compositionEngine,
      rawResultUrl: resolvedRawResultUrl,
    },
  });

  const inserted = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).insertOne(create);

  await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
    status: 'done',
    requested: true,
    requestedAt: sourceSubmission.tryOnRequest?.requestedAt ?? null,
    leatherSuitId: job.request.leatherSuitId,
    jobId: job.jobId,
    sourceImageUrl: job.source.imageUrl,
    sourceImageId: sourceSubmission.tryOnRequest?.sourceImageId,
    sourceDeleteUrl: sourceSubmission.tryOnRequest?.sourceDeleteUrl ?? null,
    resultUrl: resolvedAsset.publicResultUrl,
    resultDeleteUrl: resolvedAsset.deleteUrl ?? payload.deleteUrl ?? null,
    resultProvider: detectImageProvider(resolvedAsset.publicResultUrl),
    reviewStatus: publication.reviewStatus,
    shareVisible: publication.shareVisible,
    slideshowEligible: publication.slideshowEligible,
    lastError: null,
  });

  await upsertSubmissionTryOnPublicationLink(
    db,
    sourceSubmissionObjectId,
    buildTryOnPublicationSummary(
      inserted.insertedId.toString(),
      job.jobId,
      job.request.leatherSuitId,
      resolvedAsset.publicResultUrl,
      publication.reviewStatus,
      publication.shareVisible,
      publication.slideshowEligible
    )
  );

  const relatedEmailResult = await dispatchPendingRelatedEmailForSubmission(db, {
    ...sourceSubmission,
    _id: sourceSubmissionObjectId,
  });
  await applyEmailMetadataPatch(db, sourceSubmissionObjectId, relatedEmailResult?.metadataPatch);

  return {
    action: 'created',
    sourceSubmissionId: sourceSubmissionObjectId.toString(),
    resultSubmissionId: inserted.insertedId.toString(),
    publicationStatus: publication.reviewStatus,
    publicationVisible: publication.shareVisible,
  };
}

export async function applyCompletionFromJobResult(
  db: Db,
  job: WithId<TryOnJob>,
): Promise<TryOnCompletionResult> {
  if (!job.result?.publicResultUrl) {
    throw apiBadRequest('Try-on job result URL is missing');
  }

  // WHAT: Re-applies from the unframed worker output when an earlier
  //     completion already stored one on the derived result.
  // WHY (CAM-02): applyTryOnCompletion overwrites job.result.publicResultUrl
  //     with the framed composite, so re-applying from the job composed the
  //     event frame onto an already-framed image (reapply-result, the
  //     maintenance reconcile, scripts/reconcile-tryon-done-jobs.ts). The
  //     reframe route starts from the same raw URL for the same reason.
  //     If no frame is composed on this run (frame missing or switched off,
  //     composite failing), applyTryOnCompletion keeps the current framed
  //     result instead of publishing the raw one (resolveRetainedComposedAsset).
  const existingDerived = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ sourceJobId: job.jobId }, { projection: { 'metadata.tryOnRawResultUrl': 1 } });

  return applyTryOnCompletion(
    db,
    job,
    resolveCompletionReapplySource(job.result, existingDerived?.metadata?.tryOnRawResultUrl)
  );
}
