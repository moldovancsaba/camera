import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalSavetheworldSecret, buildCaptureUrl } from '@/lib/savetheworld/internal';
import { provisionEvent } from '@/lib/savetheworld/provision';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

// POST /api/internal/savetheworld/events  { savetheworldEventId, eventName, eventDate?, partnerId }
// Idempotently create a camera event for the partner (keyed on savetheworldEventId),
// inheriting the partner's default design. Response includes the public capture URL.
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const event = await provisionEvent({
    savetheworldEventId: body.savetheworldEventId,
    partnerId: body.partnerId,
    eventName: body.eventName,
    eventDate: body.eventDate,
  });
  const captureUrl = buildCaptureUrl(event.mongoId);
  return apiSuccess({ event: { ...event, captureUrl } }, event.created ? 201 : 200);
});

// GET /api/internal/savetheworld/events?partnerId=   |   ?eventId=<eventId or Mongo _id>
// List camera events (optionally filtered by partner), newest first, for savetheworld
// to look up the sport event it just provisioned or has linked. `eventId` returns
// exactly that event (matched on camera's eventId or its _id) regardless of the
// 200-row cap: savetheworld's campaign event had no eventDate, sorted last, and
// fell outside the cap, so its public event page answered 404.
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);
  const db = await connectToDatabase();
  const partnerId = request.nextUrl.searchParams.get('partnerId')?.trim();
  const eventId = request.nextUrl.searchParams.get('eventId')?.trim();
  const query: Record<string, unknown> = {};
  if (partnerId) query.partnerId = partnerId;
  if (eventId) {
    const byId: Record<string, unknown>[] = [{ eventId }];
    if (ObjectId.isValid(eventId)) byId.push({ _id: new ObjectId(eventId) });
    query.$or = byId;
  }
  const docs = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query)
    .sort({ eventDate: -1 })
    .limit(200)
    .toArray();
  const events = docs.map((e) => {
    const mongoId = String(e._id);
    return {
      eventId: e.eventId,
      name: e.name,
      partnerId: e.partnerId,
      partnerName: e.partnerName,
      eventDate: e.eventDate || null,
      isActive: !!e.isActive,
      mongoId,
      captureUrl: buildCaptureUrl(mongoId),
    };
  });
  return apiSuccess({ events });
});
