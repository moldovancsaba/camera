import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob, type TryOnJobStatus } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { nowIso } from '@/lib/tryon/time';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { ObjectId } from 'mongodb';

const CANCELLABLE_STATUSES: TryOnJobStatus[] = ['queued', 'retry_wait'];

export interface CancellableJobsCollection {
  findOne(filter: { jobId: string }): Promise<TryOnJob | null>;
  updateOne(
    filter: { jobId: string; status: { $in: TryOnJobStatus[] } },
    update: { $set: Record<string, unknown> }
  ): Promise<{ matchedCount: number }>;
}

/**
 * Only jobs the worker hasn't claimed yet can be cancelled here. Once a job
 * is claimed/processing/uploading, the worker owns it in-memory and a status
 * change out from under it would race its own writes -- cancelling an active
 * render needs the worker's cooperation, not just a DB flip.
 *
 * The application-level status check below is a fast path for the common
 * case; it can't see a claim the worker makes after it runs. The updateOne's
 * own filter is what actually closes that race -- it only ever flips a job
 * that is still queued/retry_wait *at the moment of the write*, and a
 * matchedCount of 0 means the worker won the race.
 */
export async function cancelTryOnJob(
  jobsCollection: CancellableJobsCollection,
  normalizedJobId: string,
  actorEmail: string
): Promise<{ job: TryOnJob; now: string }> {
  const job = await jobsCollection.findOne({ jobId: normalizedJobId });
  if (!job) {
    throw apiNotFound('Try-on job');
  }

  if (!CANCELLABLE_STATUSES.includes(job.status)) {
    throw apiBadRequest(`Only queued or retry-wait jobs can be cancelled. Current status: ${job.status}`);
  }

  const now = nowIso();
  const updateResult = await jobsCollection.updateOne(
    { jobId: normalizedJobId, status: { $in: CANCELLABLE_STATUSES } },
    {
      $set: {
        status: 'cancelled',
        stage: 'cancelled',
        updatedAt: now,
        'processing.leaseExpiresAt': null,
        'processing.finishedAt': now,
        'error.code': 'cancelled_by_admin',
        'error.message': `Cancelled by ${actorEmail}`,
      },
    }
  );

  if (updateResult.matchedCount === 0) {
    throw apiBadRequest('Job was claimed by the worker before it could be cancelled.');
  }

  return { job, now };
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
  const { job, now } = await cancelTryOnJob(
    db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS),
    normalizedJobId,
    session.user.email
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
