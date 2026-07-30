import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';

/**
 * GET /api/internal/fanmass/events
 *
 * Service-authed event feed for fanmass. Lists partner events so fanmass can
 * auto-provision one analysis project per event. Read-only.
 *
 * Query: ?all=true to include inactive events (default: active only).
 * Response: { success, data: { events: [{ eventId, name, partnerId, partnerName,
 *            messmassEventId, isActive, eventDate }] } }
 *
 * messmassEventId falls back to eventId for events created directly in camera
 * (no messmass link). Events provisioned by messmass (lib/messmass/provision.ts)
 * carry a real messmassEventId, which is used here in preference to eventId.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const includeAll = request.nextUrl.searchParams.get('all') === 'true';
  const db = await connectToDatabase();

  const query: Record<string, unknown> = { partnerId: { $type: 'string' } };
  if (!includeAll) query.isActive = true;

  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query)
    .sort({ eventDate: -1, createdAt: -1 })
    .limit(500)
    .toArray();

  return apiSuccess({
    events: events.map((e) => ({
      eventId: e.eventId,
      name: e.name,
      partnerId: e.partnerId,
      partnerName: e.partnerName ?? null,
      messmassEventId: e.messmassEventId ?? e.eventId,
      isActive: e.isActive ?? true,
      eventDate: e.eventDate ?? null,
    })),
  });
});
