import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { applyCompletionFromJobResult } from '@/lib/tryon/completion';

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

  if (job.status !== 'done') {
    throw apiBadRequest(`Only done jobs can be re-sent to the user. Current status: ${job.status}`);
  }

  if (!job.result?.publicResultUrl) {
    throw apiBadRequest('Try-on job has no completed result to resend');
  }

  const outcome = await applyCompletionFromJobResult(db, job);
  return apiSuccess({
    jobId: normalizedJobId,
    sourceSubmissionId: outcome.sourceSubmissionId,
    resultSubmissionId: outcome.resultSubmissionId,
    publicationStatus: outcome.publicationStatus,
    publicationVisible: outcome.publicationVisible,
    action: outcome.action,
    resentBy: session.user.email,
  });
});
