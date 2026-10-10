import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { countWaitingPhotos } from '@/lib/photo-vetting/queue';

export interface ActiveEventRow {
  id: string;
  name: string;
  partnerName: string;
  /** Photos of this event waiting for approval (photo vetting, camera#272). */
  photosWaiting: number;
}

// WHAT: A handful of the most recently-active events, each with the number of photos waiting for approval, for the dashboard's
// "Active events" strip.
// WHY: eventDate is optional and loosely populated (see lib/db/schemas.ts) so a true calendar-day "today" filter would silently miss
// events without a date — "most recently active" is the honest thing this data actually supports.
// (It lived in lib/tryon/dashboard-metrics.ts together with the try-on queue and vetting counts, which went with the try-on integration,
// issue 557.)
export async function collectActiveEventRows(db: Db, partnerIds: string[] | null, limit = 6): Promise<ActiveEventRow[]> {
  const query: Record<string, unknown> = { isActive: true };
  if (partnerIds) {
    if (partnerIds.length === 0) return [];
    query.partnerId = { $in: partnerIds };
  }

  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query, { projection: { eventId: 1, name: 1, partnerName: 1, eventDate: 1, updatedAt: 1 } })
    .sort({ eventDate: -1, updatedAt: -1 })
    .limit(limit)
    .toArray();
  if (events.length === 0) return [];

  const uuids = events.map((event) => event.eventId).filter((value): value is string => typeof value === 'string');
  const waitingPhotos = await countWaitingPhotos(db, uuids);

  return events.map((event) => ({
    id: String(event._id),
    name: typeof event.name === 'string' ? event.name : 'Untitled event',
    partnerName: typeof event.partnerName === 'string' ? event.partnerName : '—',
    photosWaiting: waitingPhotos.byEvent.get(event.eventId) ?? 0,
  }));
}
