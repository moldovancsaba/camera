/**
 * Remove multiple submissions from an event in one request.
 *
 * POST /api/events/[eventId]/submissions/bulk-remove
 * body: { submissionIds: string[] }
 *
 * Auth: Requires admin session
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';

export const POST = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ eventId: string }> }
) => {
  const session = await requireAuth();
  const { eventId } = await context!.params!;

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventId, 'manager');

  const body = await request.json();
  const submissionIdsRaw: unknown[] = Array.isArray(body?.submissionIds) ? body.submissionIds : [];
  if (submissionIdsRaw.length === 0) {
    throw apiBadRequest('submissionIds must be a non-empty array');
  }

  const submissionIds = Array.from(
    new Set(
      submissionIdsRaw
        .map((value: unknown) => String(value))
        .filter((value: string) => ObjectId.isValid(value))
    )
  );

  if (submissionIds.length === 0) {
    throw apiBadRequest('No valid submission IDs provided');
  }

  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) });

  if (!event) {
    throw apiNotFound('Event not found');
  }

  const eventUuid = event.eventId as string;
  const objectIds = submissionIds.map((id) => new ObjectId(id));
  const updateDoc = {
    $pull: { eventIds: eventUuid },
    $addToSet: { hiddenFromEvents: eventUuid },
    $set: { updatedAt: new Date().toISOString() },
    $unset: { eventId: '' },
  };

  const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
    { _id: { $in: objectIds } },
    updateDoc as never
  );

  if (result.matchedCount === 0) {
    throw apiNotFound('Submissions not found');
  }

  console.log(
    `✓ Removed ${result.modifiedCount}/${submissionIds.length} submissions from event ${event.name} (${eventUuid}) by ${session.user.email}`
  );

  return apiSuccess({
    message: 'Submissions removed from event',
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    removedIds: submissionIds,
  });
});
