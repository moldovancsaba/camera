import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

// WHAT: Batch-resolve event Mongo _ids to display names.
// WHY: Try-on jobs reference events only by `source.eventMongoId`; admin queue
// views previously rendered that raw hex, which no operator can read. One
// $in lookup per page render keeps this cheap.
export async function resolveEventNamesByMongoId(
  db: Db,
  mongoIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const validIds = Array.from(
    new Set(
      mongoIds.filter(
        (value): value is string => typeof value === 'string' && ObjectId.isValid(value)
      )
    )
  );
  if (validIds.length === 0) return new Map();
  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
    .toArray();
  const nameById = new Map<string, string>();
  for (const event of events) {
    if (typeof event.name === 'string' && event.name.trim()) {
      nameById.set(String(event._id), event.name);
    }
  }
  return nameById;
}
