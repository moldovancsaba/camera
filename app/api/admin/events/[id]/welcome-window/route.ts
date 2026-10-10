/**
 * What fills the photo window of the welcome page screen of an event (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md, lib/screen/welcome-window.ts).
 *
 * GET  /api/admin/events/[id]/welcome-window   the setting (`source`: `selfie` by default or `standin`), the sample selfie picked for the event and the stored picture (viewer)
 * PUT  /api/admin/events/[id]/welcome-window   `{ source?, again? }`: set the source and/or pick another sample selfie, then draw the picture again (manager); answers like GET
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes. A page's own `screenImageUrl` is never touched.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { ensureWelcomeScreen } from '@/lib/screen/welcome-screen-store';
import { parseWindowRequest, windowState } from '@/lib/screen/welcome-window';

type RouteContext = { params?: Promise<{ id: string }> };

async function load(request: NextRequest, context: RouteContext | undefined, role: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, role);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event, id };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const { db, event } = await load(request, context, 'viewer');
  return apiSuccess(await windowState(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event, id } = await load(request, context, 'manager');
  const parsed = parseWindowRequest(await request.json().catch(() => null));
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  const { source, again } = parsed.value;
  if (source !== undefined) {
    // The sample selfie is the default and is stored as nothing; only the stand-in is a choice.
    await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: new ObjectId(id) }, source === 'standin' ? { $set: { 'welcomeWindow.source': 'standin', updatedAt: generateTimestamp() } } : { $unset: { 'welcomeWindow.source': '' }, $set: { updatedAt: generateTimestamp() } });
  }
  const current = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) ?? event;
  const slideshow = await ensureDefaultSlideshow(db, current);
  if (!slideshow.ok) return apiError(slideshow.reason, 503);
  const drawn = await ensureWelcomeScreen(db, current, undefined, { again });
  if (!drawn.ok) return apiError(drawn.reason, 503);
  const saved = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) ?? current;
  return apiSuccess(await windowState(db, saved));
});
