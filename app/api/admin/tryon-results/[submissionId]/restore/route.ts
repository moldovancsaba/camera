import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import {
  buildTryOnPublicationSummary,
  upsertSubmissionTryOnPublicationLink,
} from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { nowIso } from '@/lib/tryon/time';
import { appendTryOnModerationEvent, snapshotTryOnModerationState } from '@/lib/tryon/moderation-audit';

/**
 * POST /api/admin/tryon-results/[submissionId]/restore
 * Undoes an auto-supersede: the rerun endpoint archives a result the moment
 * a rerun is REQUESTED, before knowing whether the rerun will actually
 * succeed. When that rerun job later fails, the archived result is
 * orphaned -- hidden from the pending queue with nothing having replaced
 * it. Only restores records archived for exactly that reason (won't
 * touch a result an operator genuinely rejected).
 */
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
  if (resultSubmission.tryOnModerationArchive?.reason !== 'quality_rerun_superseded') {
    throw apiBadRequest('Only results auto-archived by a rerun (not a manual reject) can be restored');
  }
  if (!resultSubmission.sourceSubmissionId || !ObjectId.isValid(resultSubmission.sourceSubmissionId)) {
    throw apiBadRequest('Try-on result is missing a valid source submission');
  }

  const now = nowIso();
  await appendTryOnModerationEvent(db, {
    resultSubmissionId: submissionId,
    resultSubmission,
    action: 'restore',
    actorEmail: session.user.email,
    nextState: snapshotTryOnModerationState(resultSubmission, {
      reviewStatus: 'pending_review',
      archiveBucket: null,
      archived: false,
      shareVisible: false,
      slideshowEligible: false,
      archiveReason: null,
      archiveSupersededByJobId: null,
      archiveSupersededAt: null,
    }),
    reason: `Restored -- the rerun job (${resultSubmission.tryOnModerationArchive?.supersededByJobId ?? 'unknown'}) that was meant to replace this never produced a result`,
  });

  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: new ObjectId(submissionId) },
    {
      $set: {
        reviewStatus: 'pending_review',
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        approvedAt: null,
        approvedBy: null,
        isShareVisible: false,
        isSlideshowEligible: false,
        updatedAt: now,
      },
      $unset: {
        tryOnModerationArchive: '',
        'metadata.tryOnSupersededByRerun': '',
        'metadata.tryOnSupersededByJobId': '',
        'metadata.tryOnSupersededAt': '',
        'metadata.tryOnSupersededReason': '',
      },
    }
  );

  const sourceSubmissionObjectId = new ObjectId(resultSubmission.sourceSubmissionId);
  const resultUrl = resultSubmission.imageUrl ?? resultSubmission.finalImageUrl ?? null;
  await upsertSubmissionTryOnPublicationLink(
    db,
    sourceSubmissionObjectId,
    buildTryOnPublicationSummary(
      submissionId,
      resultSubmission.sourceJobId ?? '',
      resultSubmission.tryOnLeatherSuitId ?? '',
      resultUrl,
      'pending_review',
      false,
      false
    )
  );
  await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
    status: 'done',
    requested: true,
    leatherSuitId: resultSubmission.tryOnLeatherSuitId ?? null,
    jobId: resultSubmission.sourceJobId ?? null,
    resultUrl,
    reviewStatus: 'pending_review',
    shareVisible: false,
    slideshowEligible: false,
    lastError: null,
  });

  return apiSuccess({ submissionId, reviewStatus: 'pending_review', archived: false });
});
