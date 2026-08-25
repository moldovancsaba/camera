import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { applyFrameToTryOnResult } from '@/lib/tryon/frame-composition';
import {
  buildTryOnPublicationSummary,
  upsertSubmissionTryOnPublicationLink,
} from '@/lib/tryon/publication';
import { patchSubmissionTryOnState } from '@/lib/tryon/jobs';
import { nowIso } from '@/lib/tryon/time';
import { appendTryOnModerationEvent, snapshotTryOnModerationState } from '@/lib/tryon/moderation-audit';

/**
 * POST /api/admin/tryon-results/[submissionId]/reframe
 * Recomposites an already-generated try-on result with a different frame,
 * without a full AI rerun. Always starts from the raw (unframed) worker
 * output -- metadata.tryOnRawResultUrl if the result was framed before,
 * otherwise the current imageUrl -- so repeated reframes don't stack frames.
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

  const payload = (await request.json().catch(() => ({}))) as { frameId?: string };
  const frameId = typeof payload.frameId === 'string' ? payload.frameId.trim() : '';
  if (!frameId) {
    throw apiBadRequest('frameId is required');
  }

  const db = await connectToDatabase();
  const resultSubmission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId), submissionKind: 'tryon_result' });

  if (!resultSubmission) {
    throw apiNotFound('Try-on result');
  }
  if (!resultSubmission.sourceSubmissionId || !ObjectId.isValid(resultSubmission.sourceSubmissionId)) {
    throw apiBadRequest('Try-on result is missing a valid source submission');
  }

  const baseRawUrl =
    typeof resultSubmission.metadata?.tryOnRawResultUrl === 'string' && resultSubmission.metadata.tryOnRawResultUrl.trim()
      ? resultSubmission.metadata.tryOnRawResultUrl.trim()
      : resultSubmission.imageUrl;
  if (!baseRawUrl) {
    throw apiBadRequest('Try-on result has no image to reframe');
  }

  // WHAT: Read loosely, not through the `Frame` interface. WHY: that
  // interface (ownershipLevel, fileUrl, width/height) describes a frame
  // model real documents were never migrated to -- confirmed against
  // production, every frame uses imageUrl and has no width/height stored;
  // app/api/frames/route.ts itself already reads this collection the same
  // untyped way. applyFrameToTryOnResult reads real dimensions from the
  // image itself when none are passed in.
  const frame = await db.collection(COLLECTIONS.FRAMES).findOne({ frameId, isActive: true });
  const frameImageUrl = typeof frame?.imageUrl === 'string' ? frame.imageUrl : null;
  if (!frame || !frameImageUrl) {
    throw apiBadRequest(`frameId "${frameId}" is not active or does not exist`);
  }

  const framed = await applyFrameToTryOnResult(
    baseRawUrl,
    frameImageUrl,
    `tryon-reframe-${submissionId}`
  );

  const now = nowIso();
  await appendTryOnModerationEvent(db, {
    resultSubmissionId: submissionId,
    resultSubmission,
    action: 'reframe',
    actorEmail: session.user.email,
    nextState: snapshotTryOnModerationState(resultSubmission),
    reason: `Changed frame to "${frame.name}"`,
  });

  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: new ObjectId(submissionId) },
    {
      $set: {
        imageUrl: framed.publicResultUrl,
        finalImageUrl: framed.publicResultUrl,
        deleteUrl: framed.deleteUrl ?? null,
        fileSize: framed.fileSize ?? null,
        mimeType: framed.mimeType ?? null,
        'metadata.compositionEngine': 'motogp_leather_magic_framed',
        'metadata.tryOnRawResultUrl': baseRawUrl,
        updatedAt: now,
      },
    }
  );

  const sourceSubmissionObjectId = new ObjectId(resultSubmission.sourceSubmissionId);
  await upsertSubmissionTryOnPublicationLink(
    db,
    sourceSubmissionObjectId,
    buildTryOnPublicationSummary(
      submissionId,
      resultSubmission.sourceJobId ?? '',
      resultSubmission.tryOnLeatherSuitId ?? '',
      framed.publicResultUrl,
      resultSubmission.reviewStatus ?? 'pending_review',
      Boolean(resultSubmission.isShareVisible),
      Boolean(resultSubmission.isSlideshowEligible)
    )
  );

  await patchSubmissionTryOnState(db, sourceSubmissionObjectId, {
    status: 'done',
    requested: true,
    leatherSuitId: resultSubmission.tryOnLeatherSuitId ?? null,
    jobId: resultSubmission.sourceJobId ?? null,
    resultUrl: framed.publicResultUrl,
    reviewStatus: resultSubmission.reviewStatus ?? 'pending_review',
    shareVisible: Boolean(resultSubmission.isShareVisible),
    slideshowEligible: Boolean(resultSubmission.isSlideshowEligible),
    lastError: null,
  });

  return apiSuccess({
    submissionId,
    imageUrl: framed.publicResultUrl,
    frameId: frame.frameId,
    frameName: frame.name,
    message: `Frame changed to "${frame.name}".`,
  });
});
