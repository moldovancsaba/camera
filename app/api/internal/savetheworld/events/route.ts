import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || '';
  const captureUrl = appUrl ? `${appUrl}/capture/${event.mongoId}` : null;
  return apiSuccess({ event: { ...event, captureUrl } }, event.created ? 201 : 200);
});

// GET /api/internal/savetheworld/events?partnerId=
// List camera events (optionally filtered by partner), newest first, for savetheworld
// to look up the sport event it just provisioned or has linked.
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);
  const db = await connectToDatabase();
  const partnerId = request.nextUrl.searchParams.get('partnerId')?.trim();
  const query: Record<string, unknown> = {};
  if (partnerId) query.partnerId = partnerId;
  const docs = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query)
    .sort({ eventDate: -1 })
    .limit(200)
    .toArray();
  const events = docs.map((e) => ({
    eventId: e.eventId,
    name: e.name,
    partnerId: e.partnerId,
    partnerName: e.partnerName,
    eventDate: e.eventDate || null,
    isActive: !!e.isActive,
  }));
  return apiSuccess({ events });
});
