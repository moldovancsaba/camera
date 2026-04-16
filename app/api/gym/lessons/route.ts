/**
 * Published gym training for signed-in members (SSO session + app access).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess } from '@/lib/api';
import { assertGymAppAccess } from '@/lib/gym/access';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  assertGymAppAccess(session);

  const db = await connectToDatabase();
  const rows = await db
    .collection(COLLECTIONS.GYM_LESSONS)
    .find({ isPublished: true })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();

  const training = rows.map((l) => ({
    ...l,
    _id: l._id?.toString(),
  }));

  return apiSuccess({
    training,
    /** @deprecated use `training` */
    lessons: training,
  });
});
