import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { provisionEvent } from '@/lib/messmass/provision';

// POST /api/internal/messmass/events
//   { messmassEventId, eventName, eventDate?, messmassPartnerId? | partnerId?, cameraEventId?, replaceMessmassEventId? }
// Create a Camera mirror or refresh/link an explicitly selected existing event.
// Existing event submissions and design are preserved when its canonical
// Messmass metadata is refreshed.
export const maxDuration = 60;

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
    cameraEventId: body.cameraEventId,
    replaceMessmassEventId: body.replaceMessmassEventId,
  });
  return apiSuccess({ event }, event.created ? 201 : 200);
});
