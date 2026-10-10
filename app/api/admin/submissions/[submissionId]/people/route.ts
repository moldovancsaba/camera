/**
 * PUT /api/admin/submissions/[submissionId]/people (issue 542, docs/PHOTO_VETTING_PLAN.md, lib/photo-vetting/people.ts)
 *
 * Saves the people the reviewer marked in a photo of an event: per person a rectangle in percent of the photo, one of the 8 person buttons (female or male, kid, young, adult or old), an
 * optional emotion and optional merchandise. The list replaces what was saved (an empty list says "looked, nobody marked"); who saved it and when is kept. Allowed for global admins and the
 * event's partner Events managers, like the review itself. Marking changes nothing about whether the photo is approved or rejected: that stays the review route.
 *
 * Body: { people: PersonTag[] }
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type Submission } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound, apiForbidden, checkRateLimit } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { resolveEventForSubmission } from '@/lib/email/submission-result-email';
import { parsePeople } from '@/lib/photo-vetting/people';

const MARK_RATE_LIMIT = { max: 120, windowMs: 60 * 1000, message: 'Too many saves. Please wait a minute and try again.' };

export const PUT = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ submissionId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, MARK_RATE_LIMIT);

  const { submissionId } = await context!.params!;
  if (!ObjectId.isValid(submissionId)) throw apiBadRequest('Invalid submission ID format');

  const body = (await request.json().catch(() => null)) as { people?: unknown } | null;
  const checked = parsePeople(body?.people);
  if (!checked.ok) throw apiBadRequest(checked.reason);

  const db = await connectToDatabase();
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(submissionId) });
  if (!submission) throw apiNotFound('Submission');

  const event = await resolveEventForSubmission(db, submission);
  if (event) {
    await assertGlobalAdminOrPartnerEventAccess(db, session, event._id.toString(), 'manager');
  } else if (!isGlobalAdminSession(session)) {
    throw apiForbidden('This photo belongs to no event; only a global admin can mark the people in it');
  }

  const peopleReview = { by: session.user.email ?? session.user.id ?? null, at: generateTimestamp() };
  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: new ObjectId(submissionId) }, { $set: { people: checked.value, peopleReview } });
  return apiSuccess({ submissionId, people: checked.value, peopleReview });
});
