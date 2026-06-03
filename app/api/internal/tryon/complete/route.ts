import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiCreated, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Event, type Frame, type Submission, type TryOnJob } from '@/lib/db/schemas';
import {
  buildDerivedTryOnSubmission,
  buildTryOnPublicationSummary,
  upsertSubmissionTryOnPublicationLink,
} from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { nowIso } from '@/lib/tryon/time';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';
import { applyFrameToTryOnResult, inspectTryOnResultAsset } from '@/lib/tryon/frame-composition';
import { shouldApprovedTryOnBeSlideshowEligible } from '@/lib/tryon/slideshow-policy';

interface CompletionPayload {
  jobId?: string;
  publicResultUrl?: string;
  deleteUrl?: string | null;
  workerId?: string | null;
  processorMeta?: {
    pipelineVersion?: string | null;
  };
}

async function resolveTryOnResultAsset(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  sourceSubmission: Submission,
  publicResultUrl: string,
  event: Pick<Event, 'tryOn'> | null
) {
  const frameId =
    typeof sourceSubmission.frameId === 'string' && sourceSubmission.frameId.trim()
      ? sourceSubmission.frameId.trim()
      : null;

  if (!frameId) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  if (!event?.tryOn?.applyFrameToReturnedResults) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  const frame = await db.collection<Frame>(COLLECTIONS.FRAMES).findOne(
    { frameId },
    { projection: { fileUrl: 1 } }
  );

  if (!frame?.fileUrl) {
    return inspectTryOnResultAsset(publicResultUrl);
  }

  try {
    return await applyFrameToTryOnResult(publicResultUrl, frame.fileUrl, `tryon-framed-${Date.now()}`);
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

async function resolveSourceEvent(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  sourceSubmission: Submission
): Promise<Pick<Event, 'tryOn'> | null> {
  const eventId =
    typeof sourceSubmission.eventId === 'string' && sourceSubmission.eventId.trim()
      ? sourceSubmission.eventId.trim()
      : null;

  if (!eventId) return null;

  return db.collection<Event>(COLLECTIONS.EVENTS).findOne(
    { eventId },
    { projection: { tryOn: 1 } }
  );
}

function resolvePublicationState(event: Pick<Event, 'tryOn'> | null) {
  if (event?.tryOn?.vettingEnabled === false) {
    return {
      reviewStatus: 'approved' as const,
      shareVisible: true,
      slideshowEligible: shouldApprovedTryOnBeSlideshowEligible(event),
      reviewedBy: 'system:auto-vetting-disabled',
      approvedBy: 'system:auto-vetting-disabled',
      archive: true,
      publicationStatus: 'approved' as const,
    };
  }

  return {
    reviewStatus: 'pending_review' as const,
    shareVisible: false,
    slideshowEligible: false,
    reviewedBy: null,
    approvedBy: null,
    archive: false,
    publicationStatus: 'pending_review' as const,
  };
}

function assertInternalTryOnSecret(request: NextRequest): void {
  const configured = process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim();
  if (!configured) {
    throw apiForbidden('CAMERA_TRYON_INTERNAL_SECRET is not configured');
  }

  const provided =
    request.headers.get('x-camera-tryon-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';

  if (!provided || provided !== configured) {
    throw apiForbidden('Invalid try-on internal secret');
  }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalTryOnSecret(request);
  const body = (await request.json()) as CompletionPayload;
  const jobId = body.jobId?.trim();
  const publicResultUrl = normalizeImgbbDirectUrl(body.publicResultUrl?.trim() ?? null);

  if (!jobId) {
    throw apiBadRequest('jobId is required');
  }
  if (!publicResultUrl) {
    throw apiBadRequest('publicResultUrl must be a valid direct i.ibb.co image URL');
  }

  const db = await connectToDatabase();
  const job = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ jobId });
  if (!job) {
    throw apiNotFound('Try-on job');
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

  const existingDerived = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ sourceJobId: jobId });
  const sourceEvent = await resolveSourceEvent(db, sourceSubmission);
  const publicationState = resolvePublicationState(sourceEvent);
  const resolvedAsset = await resolveTryOnResultAsset(db, sourceSubmission, publicResultUrl, sourceEvent);

  const now = nowIso();
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId },
    {
      $set: {
        status: 'done',
        stage: 'done',
        updatedAt: now,
        'processing.finishedAt': now,
        'processing.leaseExpiresAt': null,
        'processing.lastHeartbeatAt': now,
        ...(body.workerId ? { 'processing.workerId': body.workerId } : {}),
        result: {
          publicResultUrl: resolvedAsset.publicResultUrl,
          imgbbDeleteUrl: resolvedAsset.deleteUrl ?? body.deleteUrl ?? null,
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

  if (existingDerived?._id) {
    await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
      status: 'done',
      requested: true,
      leatherSuitId: job.request.leatherSuitId,
      jobId,
      sourceImageUrl: job.source.imageUrl,
      resultUrl:
        typeof existingDerived.imageUrl === 'string' ? existingDerived.imageUrl : resolvedAsset.publicResultUrl,
      resultDeleteUrl: resolvedAsset.deleteUrl ?? body.deleteUrl ?? null,
      resultProvider: 'imgbb',
      reviewStatus:
        (existingDerived.reviewStatus as 'pending_review' | 'approved' | 'rejected' | undefined) ?? 'pending_review',
      shareVisible: Boolean(existingDerived.isShareVisible),
      slideshowEligible: Boolean(existingDerived.isSlideshowEligible),
      lastError: null,
    });

    await upsertSubmissionTryOnPublicationLink(
      db,
      sourceSubmissionObjectId,
      buildTryOnPublicationSummary(
        existingDerived._id.toString(),
        jobId,
        job.request.leatherSuitId,
        typeof existingDerived.imageUrl === 'string' ? existingDerived.imageUrl : resolvedAsset.publicResultUrl,
        (existingDerived.reviewStatus as 'pending_review' | 'approved' | 'rejected' | undefined) ?? 'pending_review',
        Boolean(existingDerived.isShareVisible),
        Boolean(existingDerived.isSlideshowEligible)
      )
    );

    return apiSuccess({
      jobId,
      sourceSubmissionId: sourceSubmissionObjectId.toString(),
      resultSubmissionId: existingDerived._id.toString(),
      publicationStatus: 'existing',
    });
  }

  const derivedSubmission = buildDerivedTryOnSubmission({
    sourceSubmission: {
      ...sourceSubmission,
      _id: sourceSubmissionObjectId,
    },
    job: {
      ...job,
      _id: job._id ?? new ObjectId(),
    },
    publicResultUrl: resolvedAsset.publicResultUrl,
    deleteUrl: resolvedAsset.deleteUrl ?? body.deleteUrl ?? null,
    pipelineVersion: body.processorMeta?.pipelineVersion ?? null,
    resultImageMeta: {
      width: resolvedAsset.width,
      height: resolvedAsset.height,
      fileSize: resolvedAsset.fileSize,
      mimeType: resolvedAsset.mimeType,
      compositionEngine: resolvedAsset.compositionEngine,
      rawResultUrl:
        resolvedAsset.publicResultUrl !== publicResultUrl ? publicResultUrl : null,
    },
    publication: publicationState,
  });

  const insertResult = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .insertOne(derivedSubmission);

  await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
    status: 'done',
    requested: true,
    leatherSuitId: job.request.leatherSuitId,
    jobId,
    sourceImageUrl: job.source.imageUrl,
    resultUrl: resolvedAsset.publicResultUrl,
    resultDeleteUrl: resolvedAsset.deleteUrl ?? body.deleteUrl ?? null,
    resultProvider: 'imgbb',
    reviewStatus: publicationState.reviewStatus,
    shareVisible: publicationState.shareVisible,
    slideshowEligible: publicationState.slideshowEligible,
    lastError: null,
  });

  await upsertSubmissionTryOnPublicationLink(
    db,
    sourceSubmissionObjectId,
    buildTryOnPublicationSummary(
      insertResult.insertedId.toString(),
      jobId,
      job.request.leatherSuitId,
      resolvedAsset.publicResultUrl,
      publicationState.reviewStatus,
      publicationState.shareVisible,
      publicationState.slideshowEligible
    )
  );

  return apiCreated({
    jobId,
    sourceSubmissionId: sourceSubmissionObjectId.toString(),
    resultSubmissionId: insertResult.insertedId.toString(),
    publicationStatus: publicationState.publicationStatus,
  });
});
