/**
 * The welcome page screen picture of an event (issue 327, docs/BUILDING_BRICKS.md 6.2): the giant screen of its default slideshow drawn once and stored on the event.
 *
 * POST /api/admin/events/[id]/welcome-screen   draws it (and the default slideshow it comes from, when the event has none) unless the stored one is drawn from the same things (manager)
 *
 * It never touches a page's own `screenImageUrl`. `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { ensureWelcomeScreen } from '@/lib/screen/welcome-screen-store';

type RouteContext = { params?: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');

  const slideshow = await ensureDefaultSlideshow(db, event);
  if (!slideshow.ok) return apiError(slideshow.reason, 503);
  const result = await ensureWelcomeScreen(db, event);
  if (!result.ok) return apiError(result.reason, 503);
  return apiSuccess({ url: result.url, created: result.created });
});
