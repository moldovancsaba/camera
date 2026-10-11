/**
 * The stage of an event's default slideshow and the stadium background it is drawn on (issue 326, lib/screen/stage-redraw.ts).
 *
 * GET  /api/admin/events/[id]/stage-background   the stage state: whether the system drew the default slideshow's stage (so a stadium background applies), the stadium background it is drawn on now,
 *   and how many the event can use (viewer)
 * PUT  /api/admin/events/[id]/stage-background   `{ again? }`: draw the stage again on the stadium background the event uses now (`again`: pick another one), and the welcome page screen picture after
 *   it when the event has one; answers like GET (manager). A slideshow whose stage picture an editor chose is refused (409): it is never touched.
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes. The choice of the stadium backgrounds themselves is `/api/events/<id>/stadium-slot`.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { logWarn } from '@/lib/observability/logger';
import { redrawStage, stageState } from '@/lib/screen/stage-redraw';
import { ensureWelcomeScreen } from '@/lib/screen/welcome-screen-store';

type RouteContext = { params?: Promise<{ id: string }> };

// Drawing the stage and the welcome picture and uploading them takes a few seconds.
export const maxDuration = 60;

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
  return apiSuccess(await stageState(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event, id } = await load(request, context, 'manager');
  const body = (await request.json().catch(() => ({}))) as { again?: unknown } | null;
  if (body && body.again !== undefined && typeof body.again !== 'boolean') throw apiBadRequest('again must be true or false.');
  const drawn = await redrawStage(db, event, undefined, { again: body?.again === true });
  if (!drawn.ok) return apiError(drawn.reason, drawn.reason.includes('stage picture of its own') ? 409 : 503);
  const saved = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) ?? event;
  // The welcome page screen is drawn from the default slideshow: when the event has that picture and the stage changed, it follows (an event without it is not given one by this).
  if (drawn.changed && typeof (saved.welcomeScreen as { url?: unknown } | undefined)?.url === 'string') {
    try {
      await ensureWelcomeScreen(db, saved);
    } catch (error) {
      logWarn('welcome_screen.redraw_failed', 'The welcome page screen could not be drawn again after the stage changed', { eventId: String(saved.eventId ?? ''), reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return apiSuccess(await stageState(db, saved));
});
