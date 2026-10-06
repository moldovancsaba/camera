/**
 * POST /api/admin/submissions/[submissionId]/review (camera#267, docs/PHOTO_VETTING_PLAN.md)
 *
 * Approve or reject a photo of an event with vetting required. Allowed for global admins and for the event's partner Events
 * managers. Approval makes the picture, queues the held try-on, emails the guest the share link and deletes the private photo;
 * rejection keeps the photo private and emails the guest a short note.
 *
 * Body: { action: 'approve' | 'reject', reason?: string }
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound, apiForbidden, apiError, checkRateLimit } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { resolveEventForSubmission } from '@/lib/email/submission-result-email';
import { approvePhoto, rejectPhoto, type ReviewFailure } from '@/lib/photo-vetting/review';

const REVIEW_RATE_LIMIT = {
  max: 120,
  windowMs: 60 * 1000,
  message: 'Too many review actions. Please wait a minute and try again.',
};
const MAX_REASON_LENGTH = 500;

const STATUS_OF: Record<ReviewFailure, number> = { not_reviewable: 409, no_photo: 409, compose_failed: 502 };

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

  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    throw apiBadRequest('action must be "approve" or "reject"');
  }
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : null;

  const db = await connectToDatabase();
  const submission = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });
  if (!submission) {
    throw apiNotFound('Submission');
  }

  const event = await resolveEventForSubmission(db, submission);
  if (event) {
    await assertGlobalAdminOrPartnerEventAccess(db, session, event._id.toString(), 'manager');
  } else if (!isGlobalAdminSession(session)) {
    throw apiForbidden('This photo belongs to no event; only a global admin can review it');
  }

  const actor = { email: session.user.email ?? null, id: session.user.id ?? null };
  const result = action === 'approve'
    ? await approvePhoto(db, submission, actor)
    : await rejectPhoto(db, submission, actor, reason);

  if (!result.ok) {
    throw apiError(result.message, STATUS_OF[result.reason]);
  }

  return apiSuccess({
    submissionId,
    reviewStatus: action === 'approve' ? 'approved' : 'rejected',
    email: result.email,
    ...('tryOn' in result ? { tryOn: result.tryOn } : {}),
  });
});
