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

  // Only jobs the worker hasn't claimed yet can be cancelled here. Once a
  // job is claimed/processing/uploading, the worker owns it in-memory and a
  // status change out from under it would race its own writes -- cancelling
  // an active render needs the worker's cooperation, not just a DB flip.
  if (!['queued', 'retry_wait'].includes(job.status)) {
    throw apiBadRequest(`Only queued or retry-wait jobs can be cancelled. Current status: ${job.status}`);
  }

  const now = nowIso();
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId: normalizedJobId },
    {
      $set: {
        status: 'cancelled',
        stage: 'cancelled',
        updatedAt: now,
        'processing.leaseExpiresAt': null,
        'processing.finishedAt': now,
        'error.code': 'cancelled_by_admin',
        'error.message': `Cancelled by ${session.user.email}`,
      },
    }
  );

  if (ObjectId.isValid(job.source.submissionId)) {
    const submissionObjectId = new ObjectId(job.source.submissionId);
    await patchSubmissionTryOnState(db, submissionObjectId, {
      status: 'cancelled',
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
      lastError: `Cancelled by ${session.user.email}`,
    });
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionObjectId, 'tryOnJobs.jobId': job.jobId },
      {
        $set: {
          'tryOnJobs.$.status': 'cancelled',
          'tryOnJobs.$.updatedAt': now,
        },
      }
    );
  }

  console.info('[tryon:recovery] job cancelled', {
    jobId: normalizedJobId,
    previousStatus: job.status,
    actorEmail: session.user.email,
  });

  return apiSuccess({
    jobId: normalizedJobId,
    status: 'cancelled',
    stage: 'cancelled',
    recoveryAction: 'cancel',
    recoveryOutcome: 'cancelled',
    cancelledBy: session.user.email,
    message: 'Job cancelled. It will not be picked up by the worker.',
  });
});
