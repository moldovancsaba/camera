import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiCreated, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission, type TryOnJob } from '@/lib/db/schemas';
import {
  buildDerivedTryOnSubmission,
  buildTryOnPublicationSummary,
  upsertSubmissionTryOnPublicationLink,
} from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { nowIso } from '@/lib/tryon/time';

interface CompletionPayload {
  jobId?: string;
  publicResultUrl?: string;
  deleteUrl?: string | null;
  workerId?: string | null;
  processorMeta?: {
    pipelineVersion?: string | null;
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
  const publicResultUrl = body.publicResultUrl?.trim();

  if (!jobId) {
    throw apiBadRequest('jobId is required');
  }
  if (!publicResultUrl) {
    throw apiBadRequest('publicResultUrl is required');
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
          publicResultUrl,
          imgbbDeleteUrl: body.deleteUrl ?? null,
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
      resultUrl: typeof existingDerived.imageUrl === 'string' ? existingDerived.imageUrl : publicResultUrl,
      resultDeleteUrl: body.deleteUrl ?? null,
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
        typeof existingDerived.imageUrl === 'string' ? existingDerived.imageUrl : publicResultUrl,
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
    publicResultUrl,
    deleteUrl: body.deleteUrl ?? null,
    pipelineVersion: body.processorMeta?.pipelineVersion ?? null,
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
    resultUrl: publicResultUrl,
    resultDeleteUrl: body.deleteUrl ?? null,
    resultProvider: 'imgbb',
    reviewStatus: 'pending_review',
    shareVisible: false,
    slideshowEligible: false,
    lastError: null,
  });

  await upsertSubmissionTryOnPublicationLink(
    db,
    sourceSubmissionObjectId,
    buildTryOnPublicationSummary(
      insertResult.insertedId.toString(),
      jobId,
      job.request.leatherSuitId,
      publicResultUrl,
      'pending_review',
      false,
      false
    )
  );

  return apiCreated({
    jobId,
    sourceSubmissionId: sourceSubmissionObjectId.toString(),
    resultSubmissionId: insertResult.insertedId.toString(),
    publicationStatus: 'pending_review',
  });
});
