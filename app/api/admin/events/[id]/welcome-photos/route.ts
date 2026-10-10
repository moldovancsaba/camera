/**
 * The photos of an event that can be shown in the photo window of the welcome page screen (issue 540, step 5; lib/screen/welcome-photo.ts).
 *
 * GET /api/admin/events/[id]/welcome-photos   up to 60 photos that pass the one visibility rule (approved, not hidden, not archived, not broken): the editor's own gallery uploads first
 *                                              (`kind: 'clean'`, drawn with the event's frame), then the newest approved photos (`kind: 'framed'`, drawn as they are). No name or e-mail of a guest. Viewer.
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { listWindowPhotos } from '@/lib/screen/welcome-photo';

type RouteContext = { params?: Promise<{ id: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'viewer');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return apiSuccess({ photos: await listWindowPhotos(db, event) });
});
