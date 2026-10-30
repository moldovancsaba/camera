import type { Event } from '@/lib/db/schemas';

/** Public destination for every inactive event entry point. The old slug remains
 * usable when configured; otherwise the Mongo id gives the event a stable URL. */
export function inactiveEventSelfiesPath(event: Pick<Event, '_id' | 'greatestHitsSlug'>): string {
  const slug = typeof event.greatestHitsSlug === 'string'
    ? event.greatestHitsSlug.trim().toLowerCase()
    : '';
  const segment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ? slug
    : event._id?.toString() ?? '';
  return segment ? `/greatest-hits/${encodeURIComponent(segment)}` : '/';
}
