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

  const payload = (await request.json().catch(() => ({}))) as { notes?: string };
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

  const now = nowIso();
  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: new ObjectId(submissionId) },
    {
      $set: {
        reviewStatus: 'rejected',
        reviewedAt: now,
        reviewedBy: session.user.email,
        reviewNotes: typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim() : null,
        approvedAt: null,
        approvedBy: null,
        isShareVisible: false,
        isSlideshowEligible: false,
        tryOnModerationArchive: {
          archived: true,
          bucket: 'service',
          archivedAt: now,
          archivedBy: session.user.email,
        },
        'metadata.tryOnGreat': false,
        'metadata.tryOnService': true,
        'metadata.tryOnServiceAt': now,
        'metadata.tryOnServiceBy': session.user.email,
        updatedAt: now,
      },
    }
  );

  await upsertSubmissionTryOnPublicationLink(
    db,
    new ObjectId(resultSubmission.sourceSubmissionId),
    buildTryOnPublicationSummary(
      submissionId,
      resultSubmission.sourceJobId ?? '',
      resultSubmission.tryOnLeatherSuitId ?? '',
      resultSubmission.imageUrl ?? resultSubmission.finalImageUrl ?? null,
      'rejected',
      false,
      false
    )
  );

  await patchSubmissionTryOnState(db, new ObjectId(resultSubmission.sourceSubmissionId), {
    status: 'done',
    requested: true,
    leatherSuitId: resultSubmission.tryOnLeatherSuitId ?? null,
    jobId: resultSubmission.sourceJobId ?? null,
    resultUrl: resultSubmission.imageUrl ?? resultSubmission.finalImageUrl ?? null,
    reviewStatus: 'rejected',
    shareVisible: false,
    slideshowEligible: false,
    lastError: null,
  });

  return apiSuccess({ submissionId, reviewStatus: 'rejected', archived: true, archiveBucket: 'service', isService: true });
});
