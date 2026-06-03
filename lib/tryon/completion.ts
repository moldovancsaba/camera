import { ObjectId, type Db, type WithId } from 'mongodb';
import {
  COLLECTIONS,
  type Event,
  type Frame,
  type Submission,
  type TryOnJob,
} from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';
import { apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';
import { buildDerivedTryOnSubmission, buildTryOnPublicationSummary, upsertSubmissionTryOnPublicationLink } from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { shouldApprovedTryOnBeSlideshowEligible } from '@/lib/tryon/slideshow-policy';
import { applyFrameToTryOnResult, inspectTryOnResultAsset } from '@/lib/tryon/frame-composition';

type FrameRecord = {
  fileUrl?: string | null;
  imageUrl?: string | null;
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
}

export interface TryOnCompletionResult {
  action: 'created' | 'updated' | 'unchanged';
  sourceSubmissionId: string;
  resultSubmissionId: string | null;
  publicationStatus: 'pending_review' | 'approved' | 'rejected';
  publicationVisible: boolean;
}

function getCompositionReviewState(event: Pick<Event, 'tryOn'> | null) {
  if (event?.tryOn?.vettingEnabled === false) {
    return {
      reviewStatus: 'approved' as const,
      shareVisible: true,
      slideshowEligible: shouldApprovedTryOnBeSlideshowEligible(event),
    };
  }

  return {
    reviewStatus: 'pending_review' as const,
    shareVisible: false,
    slideshowEligible: false,
  };
}

export function assertInternalTryOnSecret(request: Request): void {
  const configured = process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim();
  if (!configured) {
    throw apiForbidden('CAMERA_TRYON_INTERNAL_SECRET is not configured');
  }

  const provided = request.headers.get('x-camera-tryon-secret')?.trim()
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    || '';

  if (!provided || provided !== configured) {
    throw apiForbidden('Invalid try-on internal secret');
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

async function resolveTryOnResultAsset(
  db: Db,
  sourceSubmission: Submission,
  publicResultUrl: string,
  event: Pick<Event, 'tryOn'> | null
) {
  const frameId = typeof sourceSubmission.frameId === 'string' && sourceSubmission.frameId.trim()
    ? sourceSubmission.frameId.trim()
    : null;

  if (!frameId) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  if (!event?.tryOn?.applyFrameToReturnedResults) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  const frame = await db.collection<FrameRecord>(COLLECTIONS.FRAMES).findOne(
    { frameId },
    { projection: { fileUrl: 1, imageUrl: 1 } }
  );

  const frameAssetUrl = frame ? resolveFrameAssetUrl(frame) : null;
  if (!frameAssetUrl) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  try {
    return await applyFrameToTryOnResult(publicResultUrl, frameAssetUrl, `tryon-framed-${Date.now()}`);
  } catch (error) {
    console.error('Failed to apply frame to returned try-on result; falling back to raw upload.', {
      eventId: sourceSubmission.eventId ?? null,
      frameId,
      publicResultUrl,
      error,
    });
    return inspectTryOnResultAsset(publicResultUrl);
  }
}

function isUnchangedDerivedSubmission(
  existing: Submission,
  resolvedAsset: { publicResultUrl: string; compositionEngine: string; width?: number | null; height?: number | null; fileSize?: number | null; mimeType?: string | null; deleteUrl: string | null; },
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
    existing.deleteUrl === resolvedAsset.deleteUrl &&
    existingCompositionEngine === resolvedAsset.compositionEngine &&
    existingRawResultUrl === resolvedRawResultUrl &&
    existingFinalWidth === (resolvedAsset.width ?? null)
    && existingFinalHeight === (resolvedAsset.height ?? null)
    && existingFileSize === (resolvedAsset.fileSize ?? null)
    && existingMimeType === (resolvedAsset.mimeType ?? null)
  );
}

export async function applyTryOnCompletion(
  db: Db,
  job: WithId<TryOnJob>,
  payload: TryOnCompletionPayload
): Promise<TryOnCompletionResult> {
  const publicResultUrl = normalizeImgbbDirectUrl(payload.publicResultUrl);
  if (!publicResultUrl) {
    throw apiBadRequest('publicResultUrl must be a valid direct i.ibb.co image URL');
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
  const publication = getCompositionReviewState(sourceEvent);
  const resolvedAsset = await resolveTryOnResultAsset(db, sourceSubmission, publicResultUrl, sourceEvent);
  const existingDerived = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ sourceJobId: job.jobId });

  const now = nowIso();
  const existingRawResultUrl = typeof existingDerived?.metadata === 'object'
    ? (typeof (existingDerived.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl === 'string'
      ? existingDerived.metadata.tryOnRawResultUrl
      : null)
    : null;
  const hasFramedAsset = resolvedAsset.publicResultUrl !== publicResultUrl;
  const resolvedRawResultUrl = hasFramedAsset ? publicResultUrl : existingRawResultUrl ?? null;
  const sourceReviewState = {
    reviewStatus: existingDerived?.reviewStatus ?? publication.reviewStatus,
    shareVisible: Boolean(existingDerived?.isShareVisible ?? publication.shareVisible),
    slideshowEligible: Boolean(existingDerived?.isSlideshowEligible ?? publication.slideshowEligible),
  };

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
          provider: 'imgbb',
        },
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
  };

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
      resultProvider: 'imgbb',
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
    resultProvider: 'imgbb',
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

  return applyTryOnCompletion(db, job, {
    publicResultUrl: job.result.publicResultUrl,
    deleteUrl: job.result.imgbbDeleteUrl,
  });
}
