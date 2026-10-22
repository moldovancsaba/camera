/**
 * Pushes the counters of an event to messmass (issue 521, phase 1; docs/ANALYTICS.md "Counters for messmass"): whole running totals every time (a repeat changes nothing in messmass), through
 * the sibling of the link stats channel, with its throttle and its skip of an unchanged set.
 *
 * **Switched off by default.** `syncEventCounters` first reads the setting (lib/analytics/counters-setting.ts): while it is off it returns `disabled` having read and written nothing else, so even
 * a call that slipped into a live path could not send or cost anything. A live path asks for a sync through `requestCounterSync` (lib/analytics/counters-trigger.ts), which is fire-and-forget; the
 * first real push waits for the owner to choose the event to watch and for the `photo-stats` route in messmass. It never throws, so a hook can call it without guarding. The tests run it against
 * fakes only (no database, no network): CLAUDE.md section 8, never test data into production messmass.
 *
 * Structured rejection-reason counters use the event's inherited vocabulary. Person, age, emotion, merchandise, and other per-photo analysis values come from Fanmass and are not calculated here.
 *
 * To keep a busy event from calling messmass on every decision, an event is pushed at most once per `COUNTER_SYNC_THROTTLE_MS`: the slot is claimed with one atomic update of
 * `event.counterSync.pushedAt`, so decisions arriving together make one push. The numbers of the last good push are kept next to it, and a push that would say nothing new is not made.
 */

import type { Db, ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { pushPhotoStatsToMessmass, type PhotoStatsPayload } from '@/lib/messmassClient';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { buildCounters, hasCounters, parseCounterSet, sameCounters, type CounterSet } from './counters';
import { getCountersSetting } from './counters-setting';
import { loadJourneyRows, summarizeJourney } from './journey';
import { loadPhotoFacts, loadSources, type AnalyticsEvent } from './load';
import { buildEventReport } from './report';

export const COUNTER_SYNC_THROTTLE_MS = 30_000;

export type CounterSyncResult = 'pushed' | 'unchanged' | 'throttled' | 'failed' | 'disabled' | 'not_linked' | 'nothing_to_send';

export interface SyncedEvent {
  _id: ObjectId;
  /** The UUID the photos are filed under. */
  eventId: string;
  messmassEventId?: string | null;
  /** Where the event's annotation vocabulary comes from (the partner's list and the event's own); read from the stored event when the sync runs. */
  partnerId?: unknown;
  annotationVocabulary?: unknown;
}

/** What the counters of an event are read with. */
export type CounterEvent = Pick<SyncedEvent, 'eventId' | 'partnerId' | 'annotationVocabulary'>;

export interface CounterSyncDeps {
  push: (messmassEventId: string, payload: PhotoStatsPayload) => Promise<boolean>;
  counters: (db: Db, event: CounterEvent) => Promise<CounterSet>;
  now: () => Date;
}

/** The counters of the whole event (no range of days: a counter is a running total), read from the photos, the journey recording and the event's annotation vocabulary. */
export async function loadEventCounters(db: Db, event: CounterEvent): Promise<CounterSet> {
  const [photos, journeyRows, vocabulary, eventDoc] = await Promise.all([
    loadPhotoFacts(db, event),
    loadJourneyRows(db, event.eventId),
    loadEventVocabulary(db, event),
    db.collection(COLLECTIONS.EVENTS).findOne({ eventId: event.eventId }, { projection: { _id: 1, eventId: 1, name: 1, shortUrlSlug: 1, uiLanguage: 1, messmassEventId: 1 } }),
  ]);
  const sourceEvent: AnalyticsEvent | null = eventDoc?._id ? { id: String(eventDoc._id), eventId: event.eventId, name: typeof eventDoc.name === 'string' ? eventDoc.name : 'Event', shortUrlSlug: typeof eventDoc.shortUrlSlug === 'string' ? eventDoc.shortUrlSlug : null, uiLanguage: typeof eventDoc.uiLanguage === 'string' ? eventDoc.uiLanguage : null, messmassEventId: typeof eventDoc.messmassEventId === 'string' ? eventDoc.messmassEventId : null } : null;
  const sources = sourceEvent ? await loadSources(db, sourceEvent, {}, photos) : null;
  return buildCounters(buildEventReport({ photos, vocabulary }, { timeZone: 'UTC' }), summarizeJourney(journeyRows), vocabulary, sources);
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
    const before = await events.findOneAndUpdate(claimFilter, { $set: { 'counterSync.pushedAt': now.toISOString() } }, { returnDocument: 'before', projection: { counterSync: 1, partnerId: 1, annotationVocabulary: 1 } });
    if (!before) return 'throttled';

    const counters = await deps.counters(db, { eventId: event.eventId, partnerId: before.partnerId, annotationVocabulary: before.annotationVocabulary });
    if (!hasCounters(counters)) return 'nothing_to_send';
    if (!options.force && sameCounters(parseCounterSet(before.counterSync?.counters), counters)) return 'unchanged';
    if (!(await deps.push(messmassEventId, { totals: counters.totals, averages: counters.averages, labels: counters.labels }))) return 'failed';
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
  /** Who last changed the setting (an e-mail), null when it never was. */
  updatedBy: string | null;
  linked: boolean;
  /** The numbers that would be sent now. */
  counters: CounterSet;
  /** When and what was last pushed, from `event.counterSync`; null when never. */
  lastPushAt: string | null;
  lastPushed: CounterSet | null;
}

/** What the Messmass tab shows: the setting, the link, the numbers as they are now and the last push. Read only; sends nothing. */
export async function loadCounterState(db: Db, event: CounterEvent & Pick<SyncedEvent, 'messmassEventId'> & { counterSync?: { pushedAt?: unknown; counters?: unknown } | null }): Promise<CounterState> {
  const [setting, counters] = await Promise.all([getCountersSetting(db), loadEventCounters(db, event)]);
  return {
    enabled: setting.enabled,
    updatedAt: setting.updatedAt,
    updatedBy: setting.updatedBy,
    linked: typeof event.messmassEventId === 'string' && /^[0-9a-f]{24}$/i.test(event.messmassEventId),
    counters,
    lastPushAt: typeof event.counterSync?.pushedAt === 'string' ? event.counterSync.pushedAt : null,
    lastPushed: parseCounterSet(event.counterSync?.counters),
  };
}
