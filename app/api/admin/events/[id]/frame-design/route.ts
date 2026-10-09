/**
 * The generated default frame of an event: the messmass snapshot and the editable message list (camera#234).
 *
 * GET /api/admin/events/[id]/frame-design      the snapshot and the message list (viewer)
 * PUT /api/admin/events/[id]/frame-design      { messages: string[], messageFrames?: { [message]: frameId | frameId[] } } or { reset: true } (manager); the frame images are
 *   generated afterwards, one per usable message (a 502 means the list is saved but the images are not; repeat the request).
 *   `messageFrames` says which frames of the event (assigned, switched on, with a message area) each message is written on, one id or a list (camera#366, issue 449).
 * The GET answer also lists those frames (`availableFrames`) so the editor can offer them.
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiError,
  apiNotFound,
  apiSuccess,
  checkRateLimit,
  RATE_LIMITS,
  requireAuth,
  withErrorHandler,
} from '@/lib/api';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { DEFAULT_FRAME_MESSAGES, MAX_FRAME_MESSAGES, MAX_FRAME_MESSAGE_LENGTH } from '@/lib/frame/messages';
import { saveFrameMessages } from '@/lib/frame/sync';
import { loadMessageFrames, MAX_FRAME_IMAGES } from '@/lib/frame/message-frames';
import { generateFrameVariants } from '@/lib/frame/variants';

type RouteContext = { params?: Promise<{ id: string }> };

/** Access first, then the lookup: a caller without access to the event learns nothing about whether it exists. */
async function loadEvent(id: string, session: Session, minRole: 'viewer' | 'manager') {
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, minRole);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'viewer');
  const carriers = await loadMessageFrames(db, event);

  return apiSuccess({
    frameDesign: event.frameDesign ?? null,
    defaultMessages: DEFAULT_FRAME_MESSAGES,
    limits: { maxMessages: MAX_FRAME_MESSAGES, maxLength: MAX_FRAME_MESSAGE_LENGTH, maxImages: MAX_FRAME_IMAGES },
    availableFrames: [...carriers.values()].map(({ frameId, name, imageUrl }) => ({ frameId, name, imageUrl })),
  });
});

// Rendering and uploading up to 40 images (a message on several designs is one image on each) takes a few seconds to half a minute.
export const maxDuration = 60;

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'manager');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');
  const saved = await saveFrameMessages(db, event, body as { messages?: unknown; reset?: unknown; messageFrames?: unknown });
  const images = await generateFrameVariants(db, { ...event, frameDesign: saved }).catch((error: unknown) => {
    console.error(`Event ${id}: frame images could not be generated`, error);
    throw apiError('The messages were saved but the frame images could not be generated. Try again.', 502);
  });
  return apiSuccess({ frameDesign: images.design, variants: { total: images.design.variants?.length ?? 0, generated: images.generated, reused: images.reused } });
});
