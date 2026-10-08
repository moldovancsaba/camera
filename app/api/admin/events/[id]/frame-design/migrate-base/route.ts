/**
 * Move the designers' base picture of an event into the library (camera#369).
 *
 * POST /api/admin/events/[id]/frame-design/migrate-base   (manager)
 *   {}                -> creates the event's frames from the base pictures (the same message area), assigns them, makes every message choose the frame it uses today, and
 *                        draws the images again (a picture that does not change keeps its image). The base data stays, so it can be undone.
 *   { retire: true }  -> removes the old base data, once every message chooses a frame that exists.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { migrateBaseToLibrary, retireBase } from '@/lib/frame/migrate-base';
import { generateFrameVariants } from '@/lib/frame/variants';

// Rendering and uploading up to 10 images takes a few seconds.
export const maxDuration = 60;

export const POST = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const body = (await request.json().catch(() => ({}))) as { retire?: unknown };

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  const now = generateTimestamp();

  if (body.retire === true) {
    const retired = await retireBase(db, event, now);
    if (!retired.ok) throw apiBadRequest(retired.reason);
    return apiSuccess({ retired: true });
  }

  const moved = await migrateBaseToLibrary(db, event, session.user.id, now);
  if (!moved.ok) throw apiBadRequest(moved.reason);
  const fresh = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  const images = await generateFrameVariants(db, fresh ?? event).catch((error: unknown) => {
    console.error(`Event ${id}: frame images could not be generated after the move`, error);
    throw apiError('The frames were created and chosen, but the frame images could not be drawn. Try again: nothing is lost.', 502);
  });
  return apiSuccess({
    frames: moved.frames,
    messageFrames: moved.messageFrames,
    variants: { total: images.design.variants?.length ?? 0, generated: images.generated, reused: images.reused },
  });
});
