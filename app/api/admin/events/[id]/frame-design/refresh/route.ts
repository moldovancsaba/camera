/**
 * Take a new snapshot of the messmass data the generated default frame is built from (camera#234).
 *
 * POST /api/admin/events/[id]/frame-design/refresh   (manager)
 * -> { frameDesign, changed, messmassUnavailable }
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
  apiNotFound,
  apiSuccess,
  checkRateLimit,
  RATE_LIMITS,
  requireAuth,
  withErrorHandler,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { refreshFrameDesign } from '@/lib/frame/sync';

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
  return apiSuccess({ frameDesign: design, changed, messmassUnavailable });
});
