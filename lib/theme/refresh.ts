/**
 * Keeps the theme of an event up to date with messmass (camera#285). The theme is the snapshot the generated frame is drawn from
 * (`events.frameDesign.context`), so a refresh takes a new snapshot and, for an event that already has frame images, draws the ones
 * that changed (images whose inputs are unchanged are kept). It runs
 *  - when messmass says a style, a logo or a partner changed (`POST /api/internal/messmass/theme-updated` marks the events stale and
 *    refreshes the first of them at once), and
 *  - by itself, after the response, when a guest opens an event whose snapshot is stale or older than a day.
 * An event that messmass cannot answer for keeps its old snapshot and is not asked again for ten minutes. Dependencies are injected so it
 * is unit-tested without a network or a database server.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { refreshFrameDesign } from '@/lib/frame/sync';
import { generateFrameVariants } from '@/lib/frame/variants';
import type { FrameDesign } from '@/lib/frame/context';

export const THEME_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const THEME_RETRY_AFTER_MS = 10 * 60 * 1000;

export interface ThemeRefreshDeps {
  refresh: typeof refreshFrameDesign;
  generate: typeof generateFrameVariants;
  now: () => Date;
}

const defaultDeps: ThemeRefreshDeps = { refresh: refreshFrameDesign, generate: generateFrameVariants, now: () => new Date() };

const age = (iso: unknown, now: Date): number => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? now.getTime() - t : Infinity;
};

/** A linked event whose snapshot is marked stale or is older than a day, and that was not tried in the last ten minutes. */
export function needsThemeRefresh(event: Document, now: Date = new Date()): boolean {
  if (typeof event.messmassEventId !== 'string' || !event.messmassEventId) return false;
  if (age(event.themeCheckedAt, now) < THEME_RETRY_AFTER_MS) return false;
  const design = event.frameDesign as FrameDesign | undefined;
  return event.themeStale === true || !design?.context || age(design.context.fetchedAt, now) > THEME_MAX_AGE_MS;
}

export type ThemeRefreshOutcome = 'updated' | 'unchanged' | 'unavailable' | 'failed';

export async function refreshEventTheme(db: Db, event: Document, deps: ThemeRefreshDeps = defaultDeps): Promise<ThemeRefreshOutcome> {
  const at = deps.now().toISOString();
  const events = db.collection(COLLECTIONS.EVENTS);
  try {
    const { design, changed, messmassUnavailable } = await deps.refresh(db, event);
    if (messmassUnavailable) {
      await events.updateOne({ _id: event._id }, { $set: { themeCheckedAt: at } });
      return 'unavailable';
    }
    // An event that already has frame images gets the ones whose inputs changed; the others are kept as they are. An event whose frame is
    // made from the designers' picture (frameDesign.base) is always checked, because the picture, its box or its messages may have changed
    // without the messmass data changing; an image whose key is unchanged is reused, so a check that finds nothing new draws nothing.
    if ((changed && (event.frameDesign as FrameDesign | undefined)?.variants?.length) || design.base) {
      await deps.generate(db, { ...event, frameDesign: design });
    }
    await events.updateOne({ _id: event._id }, { $set: { themeCheckedAt: at }, $unset: { themeStale: '' } });
    return changed ? 'updated' : 'unchanged';
  } catch (error) {
    console.error(`Event ${String(event._id)}: theme refresh failed`, error);
    await events.updateOne({ _id: event._id }, { $set: { themeCheckedAt: at } }).catch(() => undefined);
    return 'failed';
  }
}

/** Marks events stale: every event linked to messmass, or the ones with these messmass ids. */
export async function markThemeStale(db: Db, messmassEventIds: readonly string[] | null): Promise<number> {
  const filter = messmassEventIds ? { messmassEventId: { $in: [...messmassEventIds] } } : { messmassEventId: { $type: 'string', $ne: '' } };
  const result = await db.collection(COLLECTIONS.EVENTS).updateMany(filter, { $set: { themeStale: true }, $unset: { themeCheckedAt: '' } });
  return result.modifiedCount;
}

export interface StaleRunResult {
  refreshed: number;
  unavailable: number;
  failed: number;
  /** Events still marked stale; they refresh the next time a guest opens them. */
  remaining: number;
}

/** Refreshes stale events, oldest snapshot first, until the budget is spent (no new event is started after it). */
export async function refreshStaleEvents(db: Db, options: { limit: number; budgetMs: number }, deps: ThemeRefreshDeps = defaultDeps): Promise<StaleRunResult> {
  const startedAt = deps.now().getTime();
  const events = db.collection(COLLECTIONS.EVENTS);
  const result: StaleRunResult = { refreshed: 0, unavailable: 0, failed: 0, remaining: 0 };
  const stale = await events.find({ themeStale: true }).sort({ 'frameDesign.context.fetchedAt': 1 }).limit(options.limit).toArray();
  for (const event of stale) {
    if (deps.now().getTime() - startedAt > options.budgetMs) break;
    const outcome = await refreshEventTheme(db, event, deps);
    if (outcome === 'failed') result.failed += 1;
    else if (outcome === 'unavailable') result.unavailable += 1;
    else result.refreshed += 1;
  }
  result.remaining = await events.countDocuments({ themeStale: true });
  return result;
}
