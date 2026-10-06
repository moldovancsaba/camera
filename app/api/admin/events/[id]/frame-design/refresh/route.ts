/**
 * Take a new snapshot of the messmass data the generated default frame is built from (camera#234).
 *
 * POST /api/admin/events/[id]/frame-design/refresh   (manager)
 * -> { frameDesign, changed, messmassUnavailable, variants: { total, generated, reused } }
 *
 * After the snapshot the frame images are generated (one per usable message); images whose inputs did not change are
 * reused. If they cannot be generated the snapshot is already saved and the answer is 502; repeating is safe.
 *
 * `changed` is true when something that is drawn differs from the previous snapshot. When messmass cannot be
 * reached the previous snapshot is kept and `messmassUnavailable` is true; an event without a messmass link gets
 * the fallback built from camera's own data.
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
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { refreshFrameDesign } from '@/lib/frame/sync';
import { generateFrameVariants } from '@/lib/frame/variants';

// Rendering and uploading up to 10 images takes a few seconds.
export const maxDuration = 60;

export const POST = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');

  const db = await connectToDatabase();
  // Access first, then the lookup: a caller without access learns nothing about whether the event exists.
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');

  const { design, changed, messmassUnavailable } = await refreshFrameDesign(db, event);
  const images = await generateFrameVariants(db, { ...event, frameDesign: design }).catch((error: unknown) => {
    console.error(`Event ${id}: frame images could not be generated`, error);
    throw apiError('The snapshot was updated but the frame images could not be generated. Try again.', 502);
  });
  return apiSuccess({
    frameDesign: images.design,
    changed,
    messmassUnavailable,
    variants: { total: images.design.variants?.length ?? 0, generated: images.generated, reused: images.reused },
  });
});
