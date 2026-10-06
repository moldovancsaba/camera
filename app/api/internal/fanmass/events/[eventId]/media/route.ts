import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { buildMediaFeedPipeline } from '@/lib/fanmass/media-feed';

/**
 * GET /api/internal/fanmass/events/[eventId]/media?since=<ISO>&limit=<n>
 *
 * Service-authed, incremental photo feed for one event. Returns ORIGINAL fan
 * photos (submissionKind !== 'tryon_result') that became available after `since`
 * (the capture time, or the approval time for a vetted photo), oldest first, so fanmass pulls only new images each poll and advances its cursor.
 * Uses originalImageUrl — the raw fan photo (best for fan-worn brand exposure),
 * not the frame-composited final image. imgbb URLs are publicly fetchable.
 *
 * Response: { success, data: { eventId, media: [{ captureId, url, createdAt }] } }
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const { eventId } = await context.params;
  const sp = request.nextUrl.searchParams;
  const since = sp.get('since')?.trim();
  const parsedLimit = Number.parseInt(sp.get('limit') || '', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 200;

  const db = await connectToDatabase();

  // Submissions link to an event via the legacy single-event mirror (eventId) or the multi-event array (eventIds[]).
  // Photos that are waiting for approval or were rejected are not in the feed, and a photo is cut and ordered by when it
  // became available (its approval, for a vetted photo), so a photo approved after fanmass moved its cursor still arrives.
  const submissions = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .aggregate(buildMediaFeedPipeline(eventId, since, limit))
    .toArray();

  return apiSuccess({
    eventId,
    media: submissions.map((s) => ({
      captureId: s.submissionId,
      url: s.originalImageUrl || s.imageUrl || s.finalImageUrl,
      // The moment the photo became available to this feed (the cursor fanmass sends back as `since`).
      createdAt: s.availableAt ?? s.createdAt,
    })),
  });
});
