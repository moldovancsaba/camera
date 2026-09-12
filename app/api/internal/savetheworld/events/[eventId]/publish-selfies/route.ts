import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';

/**
 * POST /api/internal/savetheworld/events/[eventId]/publish-selfies
 *
 * Bulk-sets isShareVisible=true on every non-tryon fan submission for this
 * event that has a finalImageUrl but was not yet share-visible. Used when the
 * capture page defaulted shareOptIn to false and existing selfies need to be
 * retroactively published to the public pledge wall.
 *
 * Accepts both camera's eventId UUID and Mongo _id (same resolution as the
 * pledges endpoint).
 *
 * Response: { published: <count of documents updated> }
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) => {
  assertInternalSavetheworldSecret(request);

  const { eventId } = await context.params;
  if (!eventId) {
    return apiSuccess({ published: 0 });
  }

  const db = await connectToDatabase();

  // Resolve the event document so we can match on all its identifiers.
  const eventDoc = await db.collection(COLLECTIONS.EVENTS).findOne(
    ObjectId.isValid(eventId)
      ? { $or: [{ eventId }, { _id: new ObjectId(eventId) }] }
      : { eventId },
    { projection: { eventId: 1 } },
  );
  const eventKeys = Array.from(
    new Set(
      [eventId, eventDoc?.eventId, eventDoc ? String(eventDoc._id) : null].filter(
        (k): k is string => Boolean(k),
      ),
    ),
  );
  const eventMatch = { $or: [{ eventId: { $in: eventKeys } }, { eventIds: { $in: eventKeys } }] };

  const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
    {
      ...eventMatch,
      submissionKind: { $ne: 'tryon_result' },
      finalImageUrl: { $type: 'string' },
      isShareVisible: { $ne: true },
    },
    { $set: { isShareVisible: true } },
  );

  return apiSuccess({ published: result.modifiedCount });
});
