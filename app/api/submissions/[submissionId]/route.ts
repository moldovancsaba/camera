/**
 * Permanent Delete Submission API
 * 
 * DELETE /api/submissions/[submissionId]
 * 
 * Permanently deletes a submission from the database. This action cannot be
 * undone. Users can only delete their own submissions (verified by userId).
 * Admins can delete any submission.
 * 
 * Note: Images on imgbb.com are not deleted, only the database record.
 * 
 * Auth: Requires user session (must own submission OR be admin)
 */

import { NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { sanitizeEmail } from '@/lib/security/sanitize';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  optionalAuth,
} from '@/lib/api';
import { dispatchPendingSubmissionEmailForSubmission } from '@/lib/email/submission-result-email';

interface FinalizeSubmissionBody {
  action?: 'update_user_info' | 'finalize';
  userInfo?: {
    name?: string;
    email?: string;
  };
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
    deletedId: submissionId
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
  const normalizedUserInfo = normalizeUserInfoInput(payload.userInfo);

  if (!shouldFinalize && !normalizedUserInfo) {
    throw apiBadRequest('Invalid request payload');
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
