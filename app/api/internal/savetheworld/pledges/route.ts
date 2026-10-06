import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
import { buildWallFilter } from '@/lib/savetheworld/wall';

/**
 * GET /api/internal/savetheworld/pledges?eventId=<mongoId|eventId>&limit=<n>
 * GET /api/internal/savetheworld/pledges?eventId=<mongoId|eventId>&submissionId=<id>
 *
 * Service-authed feed of pledge selfies for savetheworld's public "people
 * taking action" wall, newest first.
 *
 * Privacy boundary — these land on a public marketing page, so this returns
 * only non-tryon submissions whose `isShareVisible` is `true` (strict opt-in:
 * a missing or `false` flag is never public; legacy photos become public only
 * through the admin's publish-selfies action), and never
 * `userEmail`/`userInfo`. Display name only, and only when the user set one.
 * A submission qualifies only if it has a displayable image; the returned
 * `imageUrl` is `previewImageUrl`, else `finalImageUrl` (the framed
 * composite), else `imageUrl` (the primary public image), never
 * `originalImageUrl` — the opposite of the fanmass feed, which wants the raw
 * photo for brand analytics and is never shown publicly.
 *
 * When `submissionId` is present, this instead looks up that ONE submission
 * directly by its `submissionId` field, bypassing the isShareVisible /
 * submissionKind / finalImageUrl filters that gate the public wall listing —
 * this path is for showing the capturer their OWN photo on their OWN private
 * post-selfie screen, not for public display. It still requires the
 * submission to match the given eventId, so one event's savetheworld
 * integration can't fetch an arbitrary submission from a different event.
 *
 * Response: { success, data: { pledges: [{ pledgeId, imageUrl, name, createdAt }], total } }
 * `total` is the number of share-visible pledges for the event regardless of
 * `limit` — savetheworld shows it as "people involved" on the event page.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const sp = request.nextUrl.searchParams;
  const eventId = sp.get('eventId')?.trim();
  const submissionId = sp.get('submissionId')?.trim();
  const parsedLimit = Number.parseInt(sp.get('limit') || '', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 60) : 12;

  if (!eventId) {
    return apiSuccess({ pledges: [] });
  }

  const db = await connectToDatabase();

  // Submissions carry camera's own eventId (UUID). savetheworld addresses the
  // same event by either that UUID or the Mongo _id (the capture URL form), so
  // resolve the event and match submissions on every identifier it has.
  const eventDoc = await db.collection(COLLECTIONS.EVENTS).findOne(
    ObjectId.isValid(eventId) ? { $or: [{ eventId }, { _id: new ObjectId(eventId) }] } : { eventId },
    { projection: { eventId: 1 } }
  );
  const eventKeys = Array.from(new Set([eventId, eventDoc?.eventId, eventDoc ? String(eventDoc._id) : null].filter((k): k is string => Boolean(k))));
  const eventMatch = { $or: [{ eventId: { $in: eventKeys } }, { eventIds: { $in: eventKeys } }] };

  if (submissionId) {
    // Private lookup: the capturer viewing their own just-saved submission.
    // Still scoped to eventId so one event can't pull another event's submission.
    const submission = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
      submissionId,
      ...eventMatch,
    });

    // A photo that is waiting for approval, or was not approved, has no picture to show yet (camera#270).
    if (!submission || submission.reviewStatus === 'pending_review' || submission.reviewStatus === 'rejected') {
      return apiSuccess({ pledges: [] });
    }

    return apiSuccess({
      pledges: [
        {
          pledgeId: submission.submissionId,
          imageUrl: submission.previewImageUrl || submission.finalImageUrl || submission.imageUrl,
          name: submission.userName || null,
          createdAt: submission.createdAt,
        },
      ],
    });
  }

  // Submissions link to an event via the legacy single-event mirror (eventId) or
  // the multi-event array (eventIds[]); buildWallFilter matches both and requires
  // isShareVisible === true.
  const wallFilter = buildWallFilter(eventKeys);
  const [submissions, total] = await Promise.all([
    db.collection(COLLECTIONS.SUBMISSIONS).find(wallFilter).sort({ createdAt: -1 }).limit(limit).toArray(),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(wallFilter),
  ]);

  return apiSuccess({
    pledges: submissions.map((s) => ({
      pledgeId: s.submissionId,
      imageUrl: s.previewImageUrl || s.finalImageUrl || s.imageUrl,
      name: s.userName || null,
      createdAt: s.createdAt,
    })),
    total,
  });
});
