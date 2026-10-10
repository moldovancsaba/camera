import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
import { buildEventSubmissionsFilter, buildPublishSelfiesFilter } from '@/lib/savetheworld/publishSelfies';

/**
 * POST /api/internal/savetheworld/events/[eventId]/publish-selfies
 *
 * Bulk-sets isShareVisible=true on every plain fan photo (never a stored try-on result) for this
 * event that was not yet share-visible. Used to retroactively publish selfies
 * taken before shareOptIn defaulted to true.
 *
 * Looks up the event by camera eventId, Mongo _id, OR savetheworldEventId so
 * both the admin URL identifier and the public page identifier work.
 *
 * Response: { published: <count updated>, total: <count matched before update> }
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) => {
  assertInternalSavetheworldSecret(request);

  const { eventId } = await context.params;
  if (!eventId) {
    return apiSuccess({ published: 0, total: 0 });
  }

  const db = await connectToDatabase();

  // Resolve by ANY identifier: camera eventId UUID, Mongo _id, or savetheworldEventId.
  const orClauses: Record<string, unknown>[] = [
    { eventId },
    { savetheworldEventId: eventId },
  ];
  if (ObjectId.isValid(eventId)) {
    orClauses.push({ _id: new ObjectId(eventId) });
  }
  const eventDoc = await db.collection(COLLECTIONS.EVENTS).findOne(
    { $or: orClauses },
    { projection: { eventId: 1 } },
  );

  // Build the full set of identifiers submissions might carry.
  const eventKeys = Array.from(
    new Set(
      [eventId, eventDoc?.eventId, eventDoc ? String(eventDoc._id) : null].filter(
        (k): k is string => Boolean(k),
      ),
    ),
  );

  // Both filters combine their clauses with $and (see lib/savetheworld/publishSelfies.ts):
  // spreading the event $or next to the image-URL $or used to drop the event
  // scope entirely, so the update ran across every event.
  const [total, result] = await Promise.all([
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(buildEventSubmissionsFilter(eventKeys)),
    db.collection(COLLECTIONS.SUBMISSIONS).updateMany(buildPublishSelfiesFilter(eventKeys), {
      $set: { isShareVisible: true },
    }),
  ]);

  return apiSuccess({ published: result.modifiedCount, total });
});
