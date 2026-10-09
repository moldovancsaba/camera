/**
 * The default slideshow of an event (camera#327, docs/BUILDING_BRICKS.md 6.2): the giant-screen design the welcome page screen and the giant screen start from.
 *
 * POST /api/admin/events/[id]/default-slideshow   makes it when the event has none (manager); an event that has one gets the same answer, nothing new
 * PUT  /api/admin/events/[id]/default-slideshow   { slideshowId } sets one of the event's slideshows as its default (manager); the new one is flagged before the old flag is
 *   taken off, so the event is never without one
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { scheduleWelcomeScreen } from '@/lib/screen/welcome-screen-store';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';

type RouteContext = { params?: Promise<{ id: string }> };

async function loadEvent(request: NextRequest, context?: RouteContext) {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const POST = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const { db, event } = await loadEvent(request, context);
  const result = await ensureDefaultSlideshow(db, event);
  if (!result.ok) return apiError(result.reason, 503);
  return apiSuccess({ slideshowId: result.slideshowId, created: result.created });
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const { db, event } = await loadEvent(request, context);
  const body = (await request.json().catch(() => null)) as { slideshowId?: unknown } | null;
  const slideshowId = typeof body?.slideshowId === 'string' ? body.slideshowId : '';
  if (!slideshowId) throw apiBadRequest('slideshowId is required');

  const slideshows = db.collection(COLLECTIONS.SLIDESHOWS);
  const own = await slideshows.findOne({ slideshowId, eventId: event.eventId });
  if (!own) throw apiNotFound('Slideshow');
  await slideshows.updateOne({ slideshowId }, { $set: { isDefault: true, updatedAt: generateTimestamp() } });
  await slideshows.updateMany({ eventId: event.eventId, slideshowId: { $ne: slideshowId }, isDefault: true }, { $unset: { isDefault: '' } });
  // The welcome page screen is the default slideshow's screen: it is drawn from the new default (owner, 2026-10-09).
  scheduleWelcomeScreen(event._id);
  return apiSuccess({ slideshowId });
});
