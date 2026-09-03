import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { appendTryOnModerationEvent, snapshotTryOnModerationState } from '@/lib/tryon/moderation-audit';

// WHAT: Permanently deletes a try-on RESULT submission (the generated
// image), mirroring the same deleteOne semantics the raw-submission
// gallery already uses for "Start remove". WHY: Reject only archives the
// result out of the active queue -- it stays visible/restorable under the
// Rejected bucket. This is for genuinely getting rid of one, e.g. a
// duplicate or a result nobody should ever see again.
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { submissionId } = await context.params;
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID');
  }

  const db = await connectToDatabase();
  const resultSubmission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId), submissionKind: 'tryon_result' });

  if (!resultSubmission) {
    throw apiNotFound('Try-on result');
  }

  const deleteResult = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .deleteOne({ _id: new ObjectId(submissionId) });

  if (deleteResult.deletedCount === 0) {
    throw new Error('Failed to remove try-on result');
  }

  await appendTryOnModerationEvent(db, {
    resultSubmissionId: submissionId,
    resultSubmission,
    action: 'remove',
    actorEmail: session.user.email,
    nextState: snapshotTryOnModerationState(resultSubmission, {
      reviewStatus: 'rejected',
      archiveBucket: 'rejected',
      archived: true,
      shareVisible: false,
      slideshowEligible: false,
      isGreat: false,
      isService: false,
    }),
    reason: 'Permanently removed by admin',
  });

  if (resultSubmission.sourceSubmissionId && ObjectId.isValid(resultSubmission.sourceSubmissionId)) {
    await patchSubmissionTryOnState(db, new ObjectId(resultSubmission.sourceSubmissionId), {
      status: 'done',
      requested: true,
      leatherSuitId: resultSubmission.tryOnLeatherSuitId ?? null,
      jobId: resultSubmission.sourceJobId ?? null,
      resultUrl: null,
      reviewStatus: 'rejected',
      shareVisible: false,
      slideshowEligible: false,
      lastError: 'Result removed by admin',
    });
  }

  console.info('[tryon:recovery] result permanently removed', {
    submissionId,
    actorEmail: session.user.email,
  });

  return apiSuccess({ submissionId, removed: true });
});
