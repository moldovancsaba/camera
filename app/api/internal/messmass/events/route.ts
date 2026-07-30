import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { provisionEvent } from '@/lib/messmass/provision';

// POST /api/internal/messmass/events
//   { messmassEventId, eventName, eventDate?, messmassPartnerId? | partnerId? }
// Idempotently create a camera event for the partner, inheriting the partner's
// default design (brand colors / frames / logos), and stamp the messmass id.
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const event = await provisionEvent({
    messmassEventId: body.messmassEventId,
    messmassPartnerId: body.messmassPartnerId,
    partnerId: body.partnerId,
    eventName: body.eventName,
    eventDate: body.eventDate,
  });
  return apiSuccess({ event }, event.created ? 201 : 200);
});
