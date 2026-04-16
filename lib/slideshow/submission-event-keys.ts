import type { ObjectId } from 'mongodb';
import type { Event } from '@/lib/db/schemas';

/**
 * Every string value submissions may use to reference the same event
 * (UUID on `event.eventId`, Mongo hex on older rows, or slideshow.eventId).
 */
export function submissionEventIdKeys(event: Event): string[] {
  const keys = new Set<string>();
  const uuid = typeof event.eventId === 'string' && event.eventId.trim() ? event.eventId.trim() : '';
  if (uuid) keys.add(uuid);
  const id = event._id as ObjectId | undefined;
  if (id) {
    keys.add(id.toString());
  }
  return [...keys].filter(Boolean);
}
