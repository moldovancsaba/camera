import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/**
 * The address of an event's own Vetting tab for a reference to the event: its uuid (`events.eventId`, what the messmass event page and the old
 * `/admin/tryon/vetting?eventId=` links carry) or its id. `null` for an unknown or empty reference.
 */
export async function eventVettingPath(db: Db, reference: string): Promise<string | null> {
  const ref = reference.trim();
  if (!ref) return null;
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ $or: [{ eventId: ref }, ...(ObjectId.isValid(ref) ? [{ _id: new ObjectId(ref) }] : [])] }, { projection: { _id: 1 } });
  return event ? `/admin/events/${String(event._id)}/vetting` : null;
}
