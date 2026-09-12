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
  const eventMatch = { $or: [{ eventId: { $in: eventKeys } }, { eventIds: { $in: eventKeys } }] };

  // Any non-tryon submission that has at least one image URL and isn't published yet.
  const filter = {
    ...eventMatch,
    submissionKind: { $ne: 'tryon_result' },
    $or: [
      { finalImageUrl: { $type: 'string' } },
      { imageUrl: { $type: 'string' } },
      { originalImageUrl: { $type: 'string' } },
    ],
    isShareVisible: { $ne: true },
  };

  const [total, result] = await Promise.all([
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({ ...eventMatch, submissionKind: { $ne: 'tryon_result' } }),
    db.collection(COLLECTIONS.SUBMISSIONS).updateMany(filter, { $set: { isShareVisible: true } }),
  ]);

  return apiSuccess({ published: result.modifiedCount, total });
});
