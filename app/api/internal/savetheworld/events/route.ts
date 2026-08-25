import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
import { provisionEvent } from '@/lib/savetheworld/provision';

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
