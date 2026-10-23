/**
 * POST /api/admin/submissions/[submissionId]/review (camera#267, docs/PHOTO_VETTING_PLAN.md)
 *
 * Approve, reject or return a photo to vetting for an event. Allowed for global admins and for the event's partner Events
 * managers. Approval makes the picture, emails the user the share link and does not delete the private unframed photo at once (issue 509: after the answer it is
 * copied to ImgBB, every copy is recorded, and the private file is deleted only when the ImgBB copy is verified, lib/storage/image-copies.ts); rejection keeps the photo private and
 * emails the user a short note.
 *
 * Body: { action: 'approve' | 'reject', reasons?: string[], reason?: string }
 *
 * A rejection needs at least one reason (issue 628, owner answers 452 to 455): `reasons` are keys of the `reject_reason` group of the event's vocabulary (lib/photo-vetting/vocabulary.ts) that the
 * event offers now, anything else is a 400; `reason` stays the free-text note. They are stored with the photo and in the review history. An approval ignores them.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound, apiForbidden, apiError, checkRateLimit } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { resolveEventForSubmission } from '@/lib/email/submission-result-email';
import { scheduleCounterSync } from '@/lib/analytics/counters-trigger';
import { approvePhoto, rejectPhoto, returnPhotoToVetting, retryApprovedPhotoEmail, type ReviewFailure } from '@/lib/photo-vetting/review';
import { offeredReasons } from '@/lib/photo-vetting/rejection';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { hasFinalizedGuestContact } from '@/lib/submissions/guest-contact';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';

const REVIEW_RATE_LIMIT = {
  max: 120,
  windowMs: 60 * 1000,
  message: 'Too many review actions. Please wait a minute and try again.',
};
const MAX_REASON_LENGTH = 500;

const STATUS_OF: Record<ReviewFailure, number> = { not_reviewable: 409, no_photo: 409, compose_failed: 502, consent_required: 409 };

export const POST = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ submissionId: string }> }
) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, REVIEW_RATE_LIMIT);

  const { submissionId } = await context!.params!;
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; reasons?: unknown } | null;
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject' && action !== 'return_to_vetting' && action !== 'retry_approval_email') {
    throw apiBadRequest('action must be "approve", "reject", "return_to_vetting" or "retry_approval_email"');
  }
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : null;
  const chosen = Array.isArray(body?.reasons) ? [...new Set((body.reasons as unknown[]).filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
  if (action === 'reject' && chosen.length === 0) {
    throw apiBadRequest('Choose at least one reason for the rejection.');
  }

  const db = await connectToDatabase();
  const submission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId), ...PRIVACY_ERASURE_ACTIVE_FILTER });
  if (!submission) {
    throw apiNotFound('Submission');
  }
  if (!hasFinalizedGuestContact(submission)) {
    throw apiError('This photo is on the 24-hour contact hold and cannot be vetted until the participant contact is completed.', 409);
  }

  const event = await resolveEventForSubmission(db, submission);
  if (event) {
    await assertGlobalAdminOrPartnerEventAccess(db, session, event._id.toString(), 'manager');
  } else if (!isGlobalAdminSession(session)) {
    throw apiForbidden('This photo belongs to no event; only a global admin can review it');
  }

  // The reasons of a rejection must be offered to this event now (a hidden or unknown key is refused); they are kept in the order of the event's list.
  let reasons: string[] = [];
  if (action === 'reject') {
    const offered = offeredReasons(await loadEventVocabulary(db, event));
    const unknown = chosen.filter((key) => !offered.includes(key));
    if (unknown.length > 0) throw apiBadRequest(`These reasons are not offered for this event: ${unknown.join(', ')}.`);
    reasons = offered.filter((key) => chosen.includes(key));
  }

  const actor = { email: session.user.email ?? null, id: session.user.id ?? null };
  const result = action === 'retry_approval_email'
    ? { ok: true as const, email: await retryApprovedPhotoEmail(db, submission._id) }
    : action === 'approve'
      ? await approvePhoto(db, submission, actor)
      : action === 'reject'
        ? await rejectPhoto(db, submission, actor, reason, reasons)
        : await returnPhotoToVetting(db, submission, actor);

  if (!result.ok) {
    throw apiError(result.message, STATUS_OF[result.reason]);
  }

  // The counters for messmass read the decisions and the reasons: ask for a push after the response (nothing happens while the counters are off).
  if (action !== 'retry_approval_email') scheduleCounterSync(db, event);
  return apiSuccess({
    submissionId,
    reviewStatus: action === 'approve' || action === 'retry_approval_email' ? 'approved' : action === 'reject' ? 'rejected' : 'pending_review',
    email: result.email,
    ...('emailDeferred' in result && result.emailDeferred === true ? { emailDeferred: true } : {}),
  });
});
