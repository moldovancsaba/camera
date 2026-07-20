import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { provisionEvent } from '@/lib/messmass/provision';

// GET /api/internal/messmass/events?unlinked=true
// List camera events for messmass to adopt (create/link a messmass event for
// each). `unlinked=true` returns only events not yet linked to a messmass event.
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  const db = await connectToDatabase();
  const unlinkedOnly = request.nextUrl.searchParams.get('unlinked') === 'true';
  const query: Record<string, unknown> = { partnerId: { $type: 'string' } };
  if (unlinkedOnly) query.messmassEventId = { $exists: false };
  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query)
    .sort({ eventDate: -1, createdAt: -1 })
    .limit(1000)
    .toArray();
  return apiSuccess({
    events: events.map((e) => ({
      eventId: e.eventId,
      name: e.name,
      partnerId: e.partnerId,
      partnerName: e.partnerName ?? null,
      eventDate: e.eventDate ?? null,
      messmassEventId: e.messmassEventId ?? null,
    })),
  });
});

// POST /api/internal/messmass/events
//   { messmassEventId, eventName, eventDate?, messmassPartnerId? | partnerId?, cameraEventId? }
// Create a camera event for the partner (inheriting the partner's default
// design) and stamp the messmass id. With `cameraEventId`, adopt that existing
// camera event instead of creating a new one.
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  const body = await request.json().catch(() => ({}));
  const event = await provisionEvent({
    messmassEventId: body.messmassEventId,
    messmassPartnerId: body.messmassPartnerId,
    partnerId: body.partnerId,
    eventName: body.eventName,
    eventDate: body.eventDate,
    cameraEventId: body.cameraEventId,
  });
  return apiSuccess({ event }, event.created ? 201 : 200);
});
