/**
 * Pushes the counters of an event to messmass (issue 521, phase 1; docs/ANALYTICS.md "Counters for messmass"): whole running totals every time (a repeat changes nothing in messmass), through
 * the sibling of the link stats channel, with its throttle and its skip of an unchanged set.
 *
 * **Switched off by default and not called by anything yet.** `syncEventCounters` first reads the setting (lib/analytics/counters-setting.ts): while it is off it returns `disabled` having read
 * and written nothing else, so even a call that slipped into a live path could not send or cost anything. Nothing in camera calls it before the owner has chosen the first event to watch and the
 * route exists in messmass (`photo-stats`); the hooks (a vetting decision, a play, a daily job) touch frozen paths and are added after the match. It never throws, so a hook can call it without
 * guarding. The tests run it against fakes only (no database, no network): CLAUDE.md section 8, never test data into production messmass.
 *
 * To keep a busy event from calling messmass on every decision, an event is pushed at most once per `COUNTER_SYNC_THROTTLE_MS`: the slot is claimed with one atomic update of
 * `event.counterSync.pushedAt`, so decisions arriving together make one push. The numbers of the last good push are kept next to it, and a push that would say nothing new is not made.
 */

import type { Db, ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { pushPhotoStatsToMessmass, type PhotoStatsPayload } from '@/lib/messmassClient';
import { buildCounters, hasCounters, parseCounterSet, sameCounters, type CounterSet } from './counters';
import { getCountersSetting } from './counters-setting';
import { loadPhotoFacts } from './load';
import { buildEventReport } from './report';

export const COUNTER_SYNC_THROTTLE_MS = 30_000;

export type CounterSyncResult = 'pushed' | 'unchanged' | 'throttled' | 'failed' | 'disabled' | 'not_linked' | 'nothing_to_send';

export interface SyncedEvent {
  _id: ObjectId;
  /** The UUID the photos are filed under. */
  eventId: string;
  messmassEventId?: string | null;
}

export interface CounterSyncDeps {
  push: (messmassEventId: string, payload: PhotoStatsPayload) => Promise<boolean>;
  counters: (db: Db, event: SyncedEvent) => Promise<CounterSet>;
  now: () => Date;
}

/** The counters of the whole event (no range of days: a counter is a running total), read from the photos. */
export async function loadEventCounters(db: Db, event: Pick<SyncedEvent, 'eventId'>): Promise<CounterSet> {
  const photos = await loadPhotoFacts(db, event);
  return buildCounters(buildEventReport({ photos }, { timeZone: 'UTC' }));
}

const realDeps: CounterSyncDeps = { push: pushPhotoStatsToMessmass, counters: loadEventCounters, now: () => new Date() };

export async function syncEventCounters(db: Db, event: SyncedEvent, options: { force?: boolean } = {}, deps: CounterSyncDeps = realDeps): Promise<CounterSyncResult> {
  try {
    if (!(await getCountersSetting(db)).enabled) return 'disabled';
    const messmassEventId = event.messmassEventId;
    if (!messmassEventId || !/^[0-9a-f]{24}$/i.test(messmassEventId)) return 'not_linked';

    const events = db.collection(COLLECTIONS.EVENTS);
    const now = deps.now();
    const claimFilter = options.force
      ? { _id: event._id }
      : { _id: event._id, $or: [{ 'counterSync.pushedAt': { $exists: false } }, { 'counterSync.pushedAt': { $lt: new Date(now.getTime() - COUNTER_SYNC_THROTTLE_MS).toISOString() } }] };
    const before = await events.findOneAndUpdate(claimFilter, { $set: { 'counterSync.pushedAt': now.toISOString() } }, { returnDocument: 'before', projection: { counterSync: 1 } });
    if (!before) return 'throttled';

    const counters = await deps.counters(db, event);
    if (!hasCounters(counters)) return 'nothing_to_send';
    if (!options.force && sameCounters(parseCounterSet(before.counterSync?.counters), counters)) return 'unchanged';
    if (!(await deps.push(messmassEventId, { totals: counters.totals, averages: counters.averages }))) return 'failed';
    await events.updateOne({ _id: event._id }, { $set: { 'counterSync.counters': counters } });
    return 'pushed';
  } catch (error) {
    console.error('The counters for messmass could not be synced', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

export interface CounterState {
  /** The setting of lib/analytics/counters-setting.ts. */
  enabled: boolean;
  updatedAt: string;
  linked: boolean;
  /** The numbers that would be sent now. */
  counters: CounterSet;
  /** When and what was last pushed, from `event.counterSync`; null when never. */
  lastPushAt: string | null;
  lastPushed: CounterSet | null;
}

/** What the Messmass tab shows: the setting, the link, the numbers as they are now and the last push. Read only; sends nothing. */
export async function loadCounterState(db: Db, event: Pick<SyncedEvent, 'eventId' | 'messmassEventId'> & { counterSync?: { pushedAt?: unknown; counters?: unknown } | null }): Promise<CounterState> {
  const [setting, counters] = await Promise.all([getCountersSetting(db), loadEventCounters(db, event)]);
  return {
    enabled: setting.enabled,
    updatedAt: setting.updatedAt,
    linked: typeof event.messmassEventId === 'string' && /^[0-9a-f]{24}$/i.test(event.messmassEventId),
    counters,
    lastPushAt: typeof event.counterSync?.pushedAt === 'string' ? event.counterSync.pushedAt : null,
    lastPushed: parseCounterSet(event.counterSync?.counters),
  };
}
