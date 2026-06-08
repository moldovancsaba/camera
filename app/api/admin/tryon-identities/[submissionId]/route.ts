import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  requireAuth,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  withErrorHandler,
} from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { isTryOnPlaceholderEmail } from '@/lib/tryon/identity';
import { nowIso } from '@/lib/tryon/time';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PATCH = withErrorHandler(async (
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    userName?: string;
    userEmail?: string;
    reason?: string;
  };
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (action !== 'mark_reviewed_unrecoverable' && action !== 'correct_identity') {
    throw apiBadRequest('action must be mark_reviewed_unrecoverable or correct_identity');
  }

  const db = await connectToDatabase();
  const doc = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId), submissionKind: 'tryon_result' });
  if (!doc) {
    throw apiNotFound('Try-on result');
  }

  const now = nowIso();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (action === 'mark_reviewed_unrecoverable') {
    patch['metadata.tryOnIdentityClassification'] = {
      status: 'reviewed_unrecoverable',
      reviewedAt: now,
      reviewedBy: session.user.email,
      reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    };
  } else {
    const userName = typeof body.userName === 'string' ? body.userName.trim() : '';
    const userEmail = typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
    if (!userName && !userEmail) {
      throw apiBadRequest('userName or userEmail is required for correct_identity');
    }
    if (userEmail && (!EMAIL_PATTERN.test(userEmail) || isTryOnPlaceholderEmail(userEmail))) {
      throw apiBadRequest('userEmail must be a valid non-placeholder address');
    }
    if (userName) patch.userName = userName;
    if (userEmail) patch.userEmail = userEmail;
    patch.userInfo = {
      ...(userName ? { name: userName } : {}),
      ...(userEmail ? { email: userEmail } : {}),
      collectedAt: now,
    };
    patch['metadata.identityManuallyCorrectedAt'] = now;
    patch['metadata.identityManuallyCorrectedReason'] = typeof body.reason === 'string' ? body.reason.trim() || null : null;
    patch['metadata.tryOnIdentityClassification'] = {
      status: 'manual_corrected',
      reviewedAt: now,
      reviewedBy: session.user.email,
      reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    };
  }

  await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: new ObjectId(submissionId) },
    { $set: patch }
  );

  return apiSuccess({ submissionId, action });
});
