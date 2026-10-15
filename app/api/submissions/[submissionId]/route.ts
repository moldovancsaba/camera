/**
 * Permanent Delete Submission API
 * 
 * DELETE /api/submissions/[submissionId]
 * 
 * Permanently deletes a submission: first its stored files (lib/submissions/delete-files.ts), then the
 * database record. This action cannot be undone. Users can only delete their own submissions (verified by userId).
 * Admins can delete any submission except a stored try-on result (409: the results of the removed try-on integration are kept as they are).
 *
 * Files: those in this project's own Blob store are deleted (a file another submission still points at
 * is kept); the imgbb delete link is requested, best effort, and never blocks the delete; when a file
 * cannot be deleted the answer is 502 and the record stays (RUNBOOK, "Deleting a submission").
 * 
 * Auth: Requires user session (must own submission OR be admin)
 */

import { NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission, type UserConsent } from '@/lib/db/schemas';
import { sanitizeEmail } from '@/lib/security/sanitize';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiError,
  optionalAuth,
} from '@/lib/api';
import { dispatchPendingSubmissionEmailForSubmission } from '@/lib/email/submission-result-email';
import { dispatchArrivedEmail } from '@/lib/email/triggers';
import { deleteSubmissionFiles } from '@/lib/submissions/delete-files';
import { recordManualPhotoDeletion } from '@/lib/analytics/photo-deletion';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { safeLinkUrl } from '@/lib/events/consent';

interface FinalizeSubmissionBody {
  action?: 'update_user_info' | 'append_consents' | 'link_account' | 'finalize';
  userInfo?: {
    name?: string;
    email?: string;
  };
  consents?: unknown;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeUserInfoInput(input?: FinalizeSubmissionBody['userInfo']): { name: string; email: string } | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const name = readTrimmedString(input.name);
  const email = sanitizeEmail(input.email || '');
  if (!name || !email) {
    return null;
  }

  return { name, email };
}

async function applySubmissionMetadataPatch(
  db: Db,
  submissionId: ObjectId,
  metadataPatch: Record<string, unknown>,
) {
  const sanitized = Object.entries(metadataPatch).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Object.keys(sanitized).length === 0) {
    return;
  }

  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submissionId },
    { $set: sanitized }
  );
}

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ submissionId: string }> }
) => {
  // Auth: Must be authenticated
  const session = await requireAuth();

  const { submissionId } = await context!.params!;

  // Validate ObjectId format
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const db = await connectToDatabase();

  // Find the submission
  const submission = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });

  if (!submission) {
    throw apiNotFound('Submission not found');
  }

  // Authorization check: User must own the submission OR be admin
  const isOwner = submission.userId === session.user.id;
  // Check app-specific role (appRole), not SSO-level role (user.role)
  const isAdmin = session.appRole === 'admin' || session.appRole === 'superadmin';
  
  if (!isOwner && !isAdmin) {
    throw apiForbidden('You can only delete your own submissions');
  }

  // WHAT: A stored try-on result (the derived submission a try-on job produced) is not deleted here.
  // WHY: The try-on integration is removed (issue 557, docs/TRYON_REMOVED.md) and its data is kept as it is, unreferenced: deleting stored
  //     try-on results, their files and the collections is a separate decision of the owner. The routes that removed a result are gone.
  if (submission.submissionKind === 'tryon_result' || typeof submission.sourceJobId === 'string') {
    throw apiError(
      'Stored try-on results of the removed try-on integration are kept as they are',
      409
    );
  }

  // Files first, row second: a failed file delete answers 502 and keeps the row, so the same
  // request can simply be repeated (camera#211).
  const files = await deleteSubmissionFiles(db, submission);

  // Preserve only the event-scoped analytics needed after this submission is permanently removed.
  await recordManualPhotoDeletion(db, submission);

  // Permanently delete the submission
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .deleteOne({ _id: new ObjectId(submissionId) });

  if (result.deletedCount === 0) {
    throw new Error('Failed to delete submission');
  }

  console.log(`✓ Permanently deleted submission ${submissionId} by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission deleted permanently',
    deletedId: submissionId,
    files: {
      deleted: files.deleted.length,
      keptShared: files.keptShared.length,
      imgbbRequested: files.imgbbRequested,
      imgbbFailed: files.imgbbFailed
    }
  });
});

/** Load the signed-in guest's already-saved capture so an OAuth round trip can restore its preview. */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params?: Promise<{ submissionId: string }> }
) => {
  const submissionId = (await context.params)?.submissionId;
  if (!submissionId || !ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const session = await optionalAuth(request);
  if (!session?.user?.id) throw apiForbidden('Sign-in is required to restore this photo');

  const db = await connectToDatabase();
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne(
    { _id: new ObjectId(submissionId) },
    { projection: { userId: 1, eventId: 1, imageUrl: 1, finalImageUrl: 1, photoReview: 1, reviewStatus: 1 } },
  );
  if (!submission) throw apiNotFound('Submission not found');

  const isAdmin = session.appRole === 'admin' || session.appRole === 'superadmin';
  if (submission.userId !== session.user.id && !isAdmin) {
    throw apiForbidden('You can only restore your own photo');
  }

  const pendingImageUrl = readTrimmedString(submission.photoReview?.photoUrl);
  const previewImageUrl = pendingImageUrl ?? readTrimmedString(submission.finalImageUrl) ?? readTrimmedString(submission.imageUrl);
  if (!previewImageUrl) throw apiNotFound('The saved photo is not available');

  return apiSuccess({
    submissionId,
    eventId: submission.eventId ?? null,
    previewImageUrl,
    pending: submission.reviewStatus === 'pending_review' || Boolean(pendingImageUrl),
  });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params?: Promise<{ submissionId: string }> }
) => {
  const submissionId = (await context.params)?.submissionId;
  if (!submissionId || !ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const payload = (await request.json().catch(() => ({}))) as FinalizeSubmissionBody;
  const action = payload.action ?? 'update_user_info';
  const shouldFinalize = action === 'finalize';
  const shouldAppendConsents = action === 'append_consents';
  const shouldLinkAccount = action === 'link_account';
  const normalizedUserInfo = normalizeUserInfoInput(payload.userInfo);
  const consents = Array.isArray(payload.consents) ? payload.consents : null;

  if (!shouldFinalize && !shouldAppendConsents && !shouldLinkAccount && !normalizedUserInfo) {
    throw apiBadRequest('Invalid request payload');
  }
  if (shouldAppendConsents && (!consents || consents.length === 0 || consents.some((item) => {
    if (!item || typeof item !== 'object') return true;
    const record = item as Record<string, unknown>;
    return typeof record.pageId !== 'string' || !record.pageId ||
      (record.pageType !== 'accept' && record.pageType !== 'cta') ||
      typeof record.checkboxText !== 'string' || !record.checkboxText ||
      (record.accepted !== true && !(record.accepted === false && record.required === false));
  }))) {
    throw apiBadRequest('Invalid consent records');
  }

  // SECURITY (camera#119): this is the public capture finalize, so the fan is not
  // authenticated. The previous code discarded the auth result, letting anyone with
  // a submission ObjectId overwrite name/email and re-trigger email indefinitely.
  // We preserve the public FIRST write but block later tampering: once userInfo is
  // set, only an authenticated admin may change it.
  const session = await optionalAuth(request);

  const db = await connectToDatabase();
  const objectId = new ObjectId(submissionId);

  const submission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: objectId });

  if (!submission) {
    throw apiNotFound('Submission not found');
  }

  if (shouldLinkAccount) {
    if (!session?.user?.id) throw apiForbidden('Sign-in is required to link this photo');
    if (submission.userId !== 'anonymous' && submission.userId !== session.user.id) {
      throw apiForbidden('This photo belongs to another account');
    }
    const now = new Date().toISOString();
    const email = session.user.email || submission.userInfo?.email || '';
    const name = session.user.name || submission.userInfo?.name || email || 'REGISTERED USER';
    const userInfo = email ? { name, email, collectedAt: now } : null;
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: objectId, userId: 'anonymous' },
      {
        $set: {
          userId: session.user.id,
          userEmail: email || 'anonymous@event',
          userName: name,
          ...(userInfo ? { userInfo } : {}),
          'metadata.identityStatus': 'REGISTERED',
          updatedAt: now,
        },
      },
    );
    if (email) {
      runAfterResponse(async () => {
        try {
          const arrived = await dispatchArrivedEmail(db, { ...submission, userEmail: email, userName: name, userInfo, _id: objectId });
          if (arrived && Object.keys(arrived.metadataPatch).length > 0) {
            await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne({ _id: objectId }, { $set: arrived.metadataPatch });
          }
        } catch (error) {
          console.warn('[email] The arrived e-mail could not be sent after account link', error instanceof Error ? error.message : error);
        }
      });
    }
    return apiSuccess({ submissionId, action, linked: true });
  }

  if (shouldAppendConsents) {
    const additions = consents as Array<Record<string, unknown>>;
    const existing = Array.isArray(submission.consents) ? submission.consents as UserConsent[] : [];
    const next = additions
      .map((record) => ({
        pageId: String(record.pageId),
        pageType: record.pageType as 'accept' | 'cta',
        checkboxText: String(record.checkboxText),
        ...(record.kind === 'terms' || record.kind === 'cookies' || record.kind === 'privacy' || record.kind === 'marketing' ? { kind: record.kind as UserConsent['kind'] } : {}),
        ...(safeLinkUrl(record.linkUrl) ? { linkUrl: safeLinkUrl(record.linkUrl) } : {}),
        accepted: record.accepted === true,
        acceptedAt: typeof record.acceptedAt === 'string' && record.acceptedAt ? record.acceptedAt : new Date().toISOString(),
        ...(typeof record.shownText === 'string' && record.shownText.trim() ? { shownText: record.shownText.trim().slice(0, 600) } : {}),
        ...(record.required === false ? { required: false as const } : {}),
      }))
      .filter((record) => !existing.some((stored) => stored.pageId === record.pageId && stored.checkboxText === record.checkboxText && stored.accepted === record.accepted));
    if (next.length > 0) {
      const now = new Date().toISOString();
      const acceptedAny = next.some((record) => record.accepted) && submission.consentPendingReason !== 'gallery';
      const consentUpdate = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: objectId },
        {
          $push: { consents: { $each: next } },
          $set: {
            updatedAt: now,
            ...(acceptedAny && submission.consentStatus === 'pending' ? {
              consentStatus: 'received',
              isShareVisible: submission.consentShareOptIn === true,
            } : {}),
          },
          ...(acceptedAny && submission.consentStatus === 'pending' ? { $unset: { consentExpiresAt: '', consentPendingReason: '', consentShareOptIn: '' } } : {}),
        },
      );
      if (consentUpdate.modifiedCount === 1 && acceptedAny && submission.consentStatus === 'pending' && submission.reviewStatus === 'approved') {
        // Approval can happen while this required login-page checkbox is still awaiting its record. Once this
        // PATCH makes the photo public, send the link now instead of leaving an approved photo unreachable.
        runAfterResponse(async () => {
          const { sendApprovedLinkAfterConsent } = await import('@/lib/photo-vetting/review');
          await sendApprovedLinkAfterConsent(db, objectId);
        });
      }
    }
    return apiSuccess({ submissionId, action, appendedConsents: next.length });
  }

  const alreadyFinalized = Boolean((submission as Submission).userInfo?.collectedAt);
  const isAdmin = Boolean(session && (session.appRole === 'admin' || session.appRole === 'superadmin'));
  if (alreadyFinalized && !isAdmin) {
    throw apiForbidden('This submission has already been finalized.');
  }

  const now = new Date().toISOString();
  const userInfoPayload =
    normalizedUserInfo
      ? {
          name: normalizedUserInfo.name,
          email: normalizedUserInfo.email,
          collectedAt: now,
        }
      : null;

  if (userInfoPayload) {
    await db
      .collection<Submission>(COLLECTIONS.SUBMISSIONS)
      .updateOne(
        { _id: objectId },
        {
          $set: {
            userInfo: userInfoPayload,
            ...(session?.user?.id ? {
              userId: session.user.id,
              userEmail: session.user.email || userInfoPayload.email,
              userName: session.user.name || userInfoPayload.name,
              'metadata.identityStatus': 'REGISTERED',
            } : {}),
          },
          $unset: {
            'metadata.emailSkipReason': '',
            'metadata.emailSentAfterSave': '',
            'metadata.emailSentAfterRelatedPhotos': '',
            'metadata.emailFailedAt': '',
            'metadata.emailError': '',
            'metadata.emailMessageId': '',
          },
        }
      );
  }

  let emailResult: Awaited<ReturnType<typeof dispatchPendingSubmissionEmailForSubmission>> | null = null;
  if (shouldFinalize) {
    const updatedSubmission =
      userInfoPayload
        ? {
            ...submission,
            userInfo: userInfoPayload,
            _id: objectId,
          }
        : {
            ...submission,
            _id: objectId,
          };

    // The "arrived" e-mail (epic 463) for a user whose address is known only now; it is sent once, so a photo that already sent it at creation does not send it again.
    try {
      const arrived = await dispatchArrivedEmail(db, { ...(updatedSubmission as Submission), _id: objectId });
      if (arrived && Object.keys(arrived.metadataPatch).length > 0) await applySubmissionMetadataPatch(db, objectId, arrived.metadataPatch);
    } catch (error) {
      console.warn('[email] The arrived e-mail could not be sent', error instanceof Error ? error.message : error);
    }

    emailResult = await dispatchPendingSubmissionEmailForSubmission(db, {
      ...(updatedSubmission as Submission),
      _id: objectId,
    });

    if (emailResult?.metadataPatch) {
      await applySubmissionMetadataPatch(db, objectId, emailResult.metadataPatch);
    }
  }

  return apiSuccess({
    submissionId,
    action,
    emailResult,
  });
});
