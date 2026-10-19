import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { buildMediaFeedPipeline } from '@/lib/fanmass/media-feed';

/**
 * GET /api/internal/fanmass/events/[eventId]/media?afterAt=<ISO>&afterId=<submission-id>&limit=<n>
 *
 * Service-authed, incremental photo feed for one event. Returns ORIGINAL fan
 * photos (submissionKind !== 'tryon_result') that became available after the compound cursor
 * (`afterAt` + `afterId`; the capture time, or approval time for a vetted photo), oldest first. `since` remains supported for
 * older Fanmass clients; new clients use the stable id tie-breaker to avoid dropping same-timestamp submissions.
 * Uses originalImageUrl — the raw fan photo (best for fan-worn brand exposure),
 * not the frame-composited final image. The compatibility feed exposes an
 * eligible image URL (Vercel Blob or legacy ImgBB); the durable claim path
 * below keeps the storage URL private.
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
  const afterAt = sp.get('afterAt')?.trim();
  const afterId = sp.get('afterId');
  const legacySince = sp.get('since')?.trim();
  const since = afterAt || legacySince;
  const parsedLimit = Number.parseInt(sp.get('limit') || '', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 200;

  const db = await connectToDatabase();

  // Submissions link to an event via the legacy single-event mirror (eventId) or the multi-event array (eventIds[]).
  // Only publicly eligible originals enter this compatibility feed: archived, hidden, broken, consent-pending, waiting, rejected,
  // and derived images stay out. A separate purpose-gated private queue is required before analysis may access those images.
  // A photo is cut and ordered by when it became available (its approval, for a vetted photo), so a late approval still arrives.
  const submissions = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .aggregate(buildMediaFeedPipeline(eventId, since, limit, afterAt ? (afterId ?? '') : undefined))
    .toArray();

  return apiSuccess({
    eventId,
    media: submissions.map((s) => ({
      captureId: s.submissionId,
      url: s.originalImageUrl || s.imageUrl || s.finalImageUrl,
      // The moment the photo became available to this feed; pair with captureId for the next compound cursor.
      createdAt: s.availableAt ?? s.createdAt,
    })),
  });
});
