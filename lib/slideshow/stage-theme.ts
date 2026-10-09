/**
 * The theme of the event a giant screen belongs to, kept for a minute per event on this server instance: the playlist is asked for every slide, and the theme (its colours and its font)
 * changes only when somebody edits the event or messmass changes the style. A failed load is not kept, and gives null (the screen then uses what the slideshow has, never a white page).
 */

import type { Db, Document } from 'mongodb';
import { loadEventTheme } from '@/lib/theme/load';
import type { EventTheme } from '@/lib/theme/event-theme';

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: Promise<EventTheme | null> }>();

export function cachedStageTheme(db: Db, event: Document, now: () => number = Date.now): Promise<EventTheme | null> {
  const key = String(event._id ?? event.eventId ?? '');
  const t = now();
  const hit = cache.get(key);
  if (hit && t - hit.at < TTL_MS) return hit.value;
  const value = loadEventTheme(db, event).catch(() => null);
  const mine = { at: t, value };
  cache.set(key, mine);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  void value.then((theme) => {
    if (theme === null && cache.get(key) === mine) cache.delete(key);
  });
  return value;
}

/** For tests: forget everything. */
export const clearStageThemeCache = (): void => cache.clear();
