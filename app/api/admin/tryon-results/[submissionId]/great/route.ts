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
import { shouldApprovedTryOnBeSlideshowEligible } from '@/lib/tryon/slideshow-policy';
import {
  dispatchPendingRelatedEmailForSubmission,
  dispatchTryOnResubmissionApprovalEmailForSubmission,
} from '@/lib/email/submission-result-email';

function sanitizeMetadataPatch(metadataPatch?: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadataPatch) return {};
  return Object.entries(metadataPatch).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

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

  const payload = (await request.json().catch(() => ({}))) as { notes?: string; great?: boolean };
  const markGreat = payload.great !== false;
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

  const sourceSubmission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(resultSubmission.sourceSubmissionId) });
  const eventRef = resultSubmission.eventId || sourceSubmission?.eventId || null;
  const eventQuery: Record<string, unknown>[] = [];
  if (eventRef) {
    eventQuery.push({ eventId: eventRef });
    if (ObjectId.isValid(eventRef)) {
      eventQuery.push({ _id: new ObjectId(eventRef) });
    }
  }
  const eventPolicy =
    eventQuery.length > 0
      ? await db.collection(COLLECTIONS.EVENTS).findOne({ $or: eventQuery })
      : null;
  const slideshowEligible = shouldApprovedTryOnBeSlideshowEligible(
    eventPolicy as
      | {
          tryOn?: {
            enabled?: boolean;
            includeApprovedResultsInSlideshows?: boolean;
            resultSlideshowMode?: unknown;
          };
        }
      | null
  );

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
        isSlideshowEligible: slideshowEligible,
        tryOnModerationArchive: {
          archived: true,
          bucket: 'approved',
          archivedAt: now,
          archivedBy: session.user.email,
        },
        updatedAt: now,
        'metadata.tryOnGreat': markGreat,
        'metadata.tryOnGreatAt': markGreat ? now : null,
        'metadata.tryOnGreatBy': markGreat ? session.user.email : null,
        'metadata.tryOnService': false,
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
      slideshowEligible
    )
  );

  await patchSubmissionTryOnState(db, new ObjectId(resultSubmission.sourceSubmissionId), {
    status: 'done',
    requested: true,
    leatherSuitId: resultSubmission.tryOnLeatherSuitId ?? null,
    jobId: resultSubmission.sourceJobId ?? null,
    resultUrl: resultSubmission.imageUrl ?? resultSubmission.finalImageUrl ?? null,
    reviewStatus: 'approved',
    shareVisible: true,
    slideshowEligible,
    lastError: null,
  });

  if (sourceSubmission) {
    const sourceSubmissionObjectId = new ObjectId(resultSubmission.sourceSubmissionId);
    const resultSubmissionObjectId = new ObjectId(submissionId);
    const sourceSubmissionWithId = {
      ...sourceSubmission,
      _id: sourceSubmissionObjectId,
    };
    const resubmissionEmailResult = await dispatchTryOnResubmissionApprovalEmailForSubmission(
      db,
      sourceSubmissionWithId,
      {
        ...resultSubmission,
        _id: resultSubmissionObjectId,
      }
    );
    const resubmissionEmailPatch = sanitizeMetadataPatch(resubmissionEmailResult?.metadataPatch);
    if (Object.keys(resubmissionEmailPatch).length > 0) {
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: resultSubmissionObjectId },
        { $set: resubmissionEmailPatch }
      );
    }

    if (resubmissionEmailResult) {
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: sourceSubmissionObjectId },
        { $set: { 'metadata.emailSendAfterRelatedPending': false } }
      );
    } else {
      const relatedEmailResult = await dispatchPendingRelatedEmailForSubmission(db, sourceSubmissionWithId);
      const relatedEmailPatch = sanitizeMetadataPatch(relatedEmailResult?.metadataPatch);
      if (Object.keys(relatedEmailPatch).length > 0) {
        await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
          { _id: sourceSubmissionObjectId },
          { $set: relatedEmailPatch }
        );
      }
    }
  }

  return apiSuccess({
    submissionId,
    reviewStatus: 'approved',
    archived: true,
    archiveBucket: 'approved',
    isGreat: markGreat,
  });
});
