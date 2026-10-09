/**
 * The slots of the generated frame of an event (docs/FRAME_SLOTS_PLAN.md, issue 502).
 *
 * PUT /api/admin/events/[id]/frame-slots   { slots: { text: { <position>: { source, text?, colour? } }, picture: { <position>: { source, images?, byMessage?, size? } } } } or { reset: true } (manager)
 *   Positions: top-left, top-center, top-right, bottom-left, bottom-center, bottom-right. Text sources: teams, team1, team2, title, message, custom. Picture sources: partnerLogo and picture
 *   in a corner, bar and picture at a centre position (a bar). Slots equal to the default frame, or `reset`, give the event the default frame again. The frame images are generated
 *   afterwards, one per usable message (a 502 means the slots are saved but the images are not; repeat the request).
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { saveFrameSlots } from '@/lib/frame/save-slots';
import { generateFrameVariants } from '@/lib/frame/variants';

type RouteContext = { params?: Promise<{ id: string }> };

/** Access first, then the lookup: a caller without access to the event learns nothing about whether it exists. */
async function loadEvent(id: string, session: Session) {
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

// Drawing and uploading up to 40 images takes a few seconds to half a minute.
export const maxDuration = 60;

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');
  const saved = await saveFrameSlots(db, event, body as { slots?: unknown; reset?: unknown });
  const images = await generateFrameVariants(db, { ...event, frameDesign: saved }).catch((error: unknown) => {
    console.error(`Event ${id}: frame images could not be generated`, error);
    throw apiError('The slots were saved but the frame images could not be generated. Try again.', 502);
  });
  return apiSuccess({ frameDesign: images.design, variants: { total: images.design.variants?.length ?? 0, generated: images.generated, reused: images.reused } });
});
