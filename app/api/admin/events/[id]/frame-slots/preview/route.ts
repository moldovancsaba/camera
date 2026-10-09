/**
 * A picture of the frame an editor is composing (docs/FRAME_SLOTS_PLAN.md, issue 502). Nothing is saved and no image is stored.
 *
 * POST /api/admin/events/[id]/frame-slots/preview   { slots, messageIndex?: number } (manager) -> { imageDataUrl, width, height, notes: string[], message: string | null }
 *   The draft slots drawn with the message at `messageIndex` of the event's list (the first usable message when it is not usable or not given), the way the real images are drawn, and what
 *   the layout has to say about them. A picture that cannot be fetched is left out and reported in `notes`.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import type { FrameDesign } from '@/lib/frame/context';
import { previewSlots } from '@/lib/frame/preview';
import { parseSlots } from '@/lib/frame/slots';
import { refreshFrameDesign } from '@/lib/frame/sync';

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

export const maxDuration = 30;

export const POST = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session);

  const body = (await request.json().catch(() => null)) as { slots?: unknown; messageIndex?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');
  const checked = parseSlots(body.slots);
  if (!checked.ok) throw apiBadRequest(checked.error);
  const messageIndex = Number.isInteger(body.messageIndex) ? (body.messageIndex as number) : null;
  // An event with no snapshot yet is drawn from the fallback snapshot (nothing is saved by a preview unless the snapshot did not exist, which the Frames page creates anyway).
  const design = (event.frameDesign as FrameDesign | undefined) ?? (await refreshFrameDesign(db, event)).design;
  const preview = await previewSlots(design, checked.slots, messageIndex);
  return apiSuccess({ imageDataUrl: `data:image/png;base64,${preview.png.toString('base64')}`, width: preview.width, height: preview.height, notes: preview.notes, message: preview.message });
});
