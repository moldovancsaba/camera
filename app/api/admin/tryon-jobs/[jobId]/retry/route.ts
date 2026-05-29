import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { nowIso } from '@/lib/tryon/time';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { ObjectId } from 'mongodb';

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
  const job = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ jobId: normalizedJobId });
  if (!job) {
    throw apiNotFound('Try-on job');
  }

  if (!['failed', 'retry_wait'].includes(job.status)) {
    throw apiBadRequest(`Only failed or retry-wait jobs can be retried. Current status: ${job.status}`);
  }

  const now = nowIso();
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId: normalizedJobId },
    {
      $set: {
        status: 'queued',
        stage: 'queued',
        updatedAt: now,
        'processing.workerId': null,
        'processing.claimedAt': null,
        'processing.leaseExpiresAt': null,
        'processing.startedAt': null,
        'processing.finishedAt': null,
        'processing.attemptCount': 0,
        'processing.nextAttemptAt': now,
        'processing.lastHeartbeatAt': null,
        'result.publicResultUrl': null,
        'result.imgbbDeleteUrl': null,
        'result.provider': null,
        'error.code': null,
        'error.message': null,
        'error.details': null,
      },
    }
  );

  if (ObjectId.isValid(job.source.submissionId)) {
    const submissionObjectId = new ObjectId(job.source.submissionId);
    await patchSubmissionTryOnState(db, submissionObjectId, {
      status: 'queued',
      requested: true,
      leatherSuitId: job.request.leatherSuitId,
      jobId: job.jobId,
      sourceImageUrl: job.source.imageUrl,
      resultUrl: null,
      resultDeleteUrl: null,
      resultProvider: null,
      reviewStatus: null,
      shareVisible: false,
      slideshowEligible: false,
      lastError: null,
    });
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionObjectId, 'tryOnJobs.jobId': job.jobId },
      {
        $set: {
          'tryOnJobs.$.status': 'queued',
          'tryOnJobs.$.resultUrl': null,
          'tryOnJobs.$.updatedAt': now,
        },
      }
    );
  }

  return apiSuccess({
    jobId: normalizedJobId,
    status: 'queued',
    stage: 'queued',
    retryRequestedBy: session.user.email,
  });
});
