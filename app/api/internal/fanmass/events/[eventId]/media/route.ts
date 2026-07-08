import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';

/**
 * GET /api/internal/fanmass/events/[eventId]/media?since=<ISO>&limit=<n>
 *
 * Service-authed, incremental photo feed for one event. Returns ORIGINAL fan
 * photos (submissionKind !== 'tryon_result') captured after `since`, oldest
 * first, so fanmass pulls only new images each poll and advances its cursor.
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

  const { eventId } = await context.params;
  const sp = request.nextUrl.searchParams;
  const since = sp.get('since')?.trim();
  const parsedLimit = Number.parseInt(sp.get('limit') || '', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 200;

  const db = await connectToDatabase();

  // Submissions link to an event via the legacy single-event mirror (eventId) or
  // the multi-event array (eventIds[]).
  const query: Record<string, unknown> = {
    $or: [{ eventId }, { eventIds: eventId }],
    submissionKind: { $ne: 'tryon_result' },
    originalImageUrl: { $type: 'string' },
  };
  if (since) query.createdAt = { $gt: since };

  const submissions = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  return apiSuccess({
    eventId,
    media: submissions.map((s) => ({
      captureId: s.submissionId,
      url: s.originalImageUrl || s.imageUrl || s.finalImageUrl,
      createdAt: s.createdAt,
    })),
  });
});
