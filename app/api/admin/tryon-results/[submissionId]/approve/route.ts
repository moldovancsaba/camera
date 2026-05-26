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
        reviewStatus: 'approved',
        reviewedAt: now,
        reviewedBy: session.user.email,
        reviewNotes: typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim() : null,
        approvedAt: now,
        approvedBy: session.user.email,
        isShareVisible: true,
        isSlideshowEligible: true,
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
      'approved',
      true,
      true
    )
  );

  return apiSuccess({ submissionId, reviewStatus: 'approved' });
});
