import { createTryOnJobId } from '@/lib/tryon/hash';
import { nowIso } from '@/lib/tryon/time';
import { patchSubmissionTryOnState, buildSubmissionTryOnLink, upsertSubmissionTryOnLink } from '@/lib/tryon/jobs';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission, type TryOnJob, type TryOnSetup } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { appendTryOnModerationEvent, snapshotTryOnModerationState } from '@/lib/tryon/moderation-audit';

function buildRerunRequestHash(requestHash: string): string {
  return `${requestHash}::rerun:${createTryOnJobId()}`;
}

function normalizeSetupId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildRerunJob(job: TryOnJob, setupIdOverride?: string | null): TryOnJob {
  const createdAt = nowIso();
  const { _id: _sourceId, ...template } = job;

  return {
    ...template,
    jobId: createTryOnJobId(),
    requestHash: buildRerunRequestHash(job.requestHash),
    status: 'queued',
    stage: 'queued',
    createdAt,
    updatedAt: createdAt,
    processing: {
      workerId: null,
      claimedAt: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: null,
      attemptCount: 0,
      nextAttemptAt: createdAt,
      lastHeartbeatAt: null,
    },
    result: {
      publicResultUrl: null,
      imgbbDeleteUrl: null,
      provider: null,
    },
    request: {
      ...job.request,
      rerunOfJobId: job.jobId,
      ...(setupIdOverride ? { setupId: setupIdOverride } : {}),
    },
    error: {
      code: null,
      message: null,
      details: null,
    },
  };
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { jobId } = await context.params;
  const normalizedJobId = jobId?.trim();
  if (!normalizedJobId) {
    throw apiBadRequest('jobId is required');
  }

  const db = await connectToDatabase();
  const sourceJob = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ jobId: normalizedJobId });
  if (!sourceJob) {
    throw apiNotFound('Try-on job');
  }

  const body = await request.json().catch(() => ({}));
  const requestedSetupId = normalizeSetupId(
    typeof body === 'object' &&
    body !== null &&
    'setupId' in body &&
    typeof (body as { setupId?: unknown }).setupId === 'string'
      ? (body as { setupId: string }).setupId
      : undefined
  );
  if (requestedSetupId) {
    const setup = await db
      .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
      .findOne({ setupId: requestedSetupId, active: true });
    if (!setup) {
      throw apiBadRequest(`setupId "${requestedSetupId}" is not active or does not exist`);
    }
  }

  if (
    sourceJob.status === 'processing' ||
    sourceJob.status === 'claimed' ||
    sourceJob.status === 'uploading_result'
  ) {
    throw apiBadRequest(`Only non-active jobs can be rerun. Current status: ${sourceJob.status}`);
  }

  if (
    typeof sourceJob.source?.submissionId !== 'string' ||
    !sourceJob.source.submissionId.trim() ||
    typeof sourceJob.source?.imageUrl !== 'string' ||
    !sourceJob.source.imageUrl.trim() ||
    typeof sourceJob.request?.leatherSuitId !== 'string' ||
    !sourceJob.request.leatherSuitId.trim()
  ) {
    throw apiBadRequest('Original job is missing source or request details required for rerun');
  }

  const rerunJob = buildRerunJob(sourceJob, requestedSetupId);

  const inserted = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).insertOne(rerunJob);
  const priorResult = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ sourceJobId: normalizedJobId, submissionKind: 'tryon_result' });
  if (priorResult?._id) {
    await appendTryOnModerationEvent(db, {
      resultSubmissionId: priorResult._id.toString(),
      resultSubmission: priorResult,
      action: 'rerun',
      actorEmail: session.user.email,
      nextState: snapshotTryOnModerationState(priorResult, {
        shareVisible: false,
        slideshowEligible: false,
      }),
      metadata: {
        rerunJobId: rerunJob.jobId,
        rerunOfJobId: sourceJob.jobId,
        setupId: rerunJob.request.setupId ?? null,
      },
    });
  }

  if (ObjectId.isValid(sourceJob.source.submissionId)) {
    const submissionObjectId = new ObjectId(sourceJob.source.submissionId);
    await patchSubmissionTryOnState(db, submissionObjectId, {
      status: 'queued',
      requested: true,
      leatherSuitId: sourceJob.request.leatherSuitId,
      jobId: rerunJob.jobId,
      sourceImageUrl: sourceJob.source.imageUrl,
      sourceDeleteUrl: null,
      sourceImageId: null,
      resultUrl: null,
      resultDeleteUrl: null,
      resultProvider: null,
      reviewStatus: null,
      shareVisible: false,
      slideshowEligible: false,
      lastError: null,
    });
    await upsertSubmissionTryOnLink(
      db,
      submissionObjectId,
      buildSubmissionTryOnLink(
        { ...rerunJob, _id: inserted.insertedId },
        'queued',
        null
      )
    );
  }

  return apiSuccess({
    jobId: rerunJob.jobId,
    sourceJobId: normalizedJobId,
    setupId: rerunJob.request.setupId ?? null,
    rerunOfJobId: sourceJob.jobId,
    status: 'queued',
    stage: 'queued',
    createdAt: rerunJob.createdAt,
    rerunRequestedBy: session.user.email,
  });
});
