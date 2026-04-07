/**
 * Resolve an event document from the value stored on a slideshow's `eventId` field.
 *
 * Historically some slideshows stored the event MongoDB `_id`; newer rows store the
 * event UUID (`event.eventId`). Both must work for playlist / next-candidate.
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { Event } from '@/lib/db/schemas';

export async function findEventForSlideshow(
  db: Db,
  storedEventId: string
): Promise<Event | null> {
  if (ObjectId.isValid(storedEventId)) {
    const byOid = await db
      .collection(COLLECTIONS.EVENTS)
      .findOne({ _id: new ObjectId(storedEventId) });
    if (byOid) {
      return byOid as Event;
    }
  }

  const byUuid = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ eventId: storedEventId });
  return byUuid as Event | null;
}
