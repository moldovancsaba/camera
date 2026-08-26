import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';

/**
 * GET /api/internal/savetheworld/pledges?eventId=<mongoId|eventId>&limit=<n>
 *
 * Service-authed feed of pledge selfies for savetheworld's public "people
 * taking action" wall, newest first.
 *
 * Privacy boundary — these land on a public marketing page, so this returns
 * ONLY submissions the capturer published themselves (`isShareVisible`), and
 * never `userEmail`/`userInfo`. Display name only, and only when the user set
 * one. Uses `finalImageUrl` (the framed composite the user chose to share),
 * not `originalImageUrl` — the opposite of the fanmass feed, which wants the
 * raw photo for brand analytics and is never shown publicly.
 *
 * Response: { success, data: { pledges: [{ pledgeId, imageUrl, name, createdAt }] } }
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const sp = request.nextUrl.searchParams;
  const eventId = sp.get('eventId')?.trim();
  const parsedLimit = Number.parseInt(sp.get('limit') || '', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 60) : 12;

  if (!eventId) {
    return apiSuccess({ pledges: [] });
  }

  const db = await connectToDatabase();

  // Submissions link to an event via the legacy single-event mirror (eventId) or
  // the multi-event array (eventIds[]).
  const submissions = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find({
      $or: [{ eventId }, { eventIds: eventId }],
      submissionKind: { $ne: 'tryon_result' },
      isShareVisible: true,
      finalImageUrl: { $type: 'string' },
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return apiSuccess({
    pledges: submissions.map((s) => ({
      pledgeId: s.submissionId,
      imageUrl: s.previewImageUrl || s.finalImageUrl,
      name: s.userName || null,
      createdAt: s.createdAt,
    })),
  });
});
