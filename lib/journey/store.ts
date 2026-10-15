/**
 * Writes the journey records (issue 521, phase 2; docs/JOURNEY_RECORDING.md). Server side, and **called only after the answer was sent** (lib/api/run-after-response.ts), so it can never slow
 * the page that sent the beacon. Two writes per batch, each failing on its own:
 *
 * - `journey_daily`: a count for each event, UTC day, name and key, bumped with `$inc` (one `bulkWrite`, no row per record). This is what the Analytics view and the counters for messmass
 *   read, and it is kept for good: it holds numbers and nothing about a person.
 * - `journey_events`: one row per record (event, visit id, name, key, milliseconds since the page opened, the time) for the funnel and the timings, **removed by the database 30 days after
 *   `at`** (a TTL index, lib/db/ensure-indexes.ts `ensureJourneyIndexes`).
 *
 * What is never written: an IP address, a user agent, a cookie, a fingerprint, a name, an e-mail, a photo, an address of a page. The visit id is a random string made by the page and held in its
 * memory; it links the records of one visit and nothing else. The device kind of a visit is one word (`ios`, `android`, `desktop`, `unknown`) made from the user agent by the route and kept as
 * the key of the `journey.start` record; the user agent itself is not kept. Unit-tested in store.test.ts.
 */

import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureJourneyIndexes } from '@/lib/db/ensure-indexes';
import { logWarn } from '@/lib/observability/logger';
import { NO_KEY, isJourneyKey, type JourneyBatch, type JourneyEvent, type JourneyName } from './events';
import { journeyRecordingEnabled } from './setting';

/** The session id the server gives to the records it makes itself (the share page opened, the photo downloaded): there is no visit behind them. */
export const SERVER_VISIT = 'server';

export interface RollupRow {
  name: JourneyName;
  key: string;
  count: number;
}

/** The counts of a batch by name and key. Pure. */
export function rollupOf(events: readonly JourneyEvent[]): RollupRow[] {
  const rows = new Map<string, RollupRow>();
  for (const event of events) {
    const id = `${event.name}\u0000${event.key}`;
    const row = rows.get(id);
    if (row) row.count += 1;
    else rows.set(id, { name: event.name, key: event.key, count: 1 });
  }
  return [...rows.values()];
}

/** The UTC day a record is counted on. */
export const dayOf = (now: Date): string => now.toISOString().slice(0, 10);

const INDEX_RETRY_MS = 10 * 60_000;
let indexesCheckedAt = 0;

/** Creates the journey indexes once per server instance (and again after ten minutes if that failed), so the 30 days hold even if the index script was not run. Never throws. */
async function ensureIndexesOnce(db: Db, now: number): Promise<void> {
  if (indexesCheckedAt !== 0 && now - indexesCheckedAt < INDEX_RETRY_MS) return;
  indexesCheckedAt = now;
  try {
    const results = await ensureJourneyIndexes(db);
    if (results.every((result) => result.status === 'error')) indexesCheckedAt = 0;
    else if (results.some((result) => result.status === 'error')) logWarn('journey.index_failed', 'A journey index could not be created', { results: results.filter((result) => result.status === 'error').map((result) => ({ collection: result.collection, detail: result.detail })) });
  } catch {
    indexesCheckedAt = 0;
  }
}

/** Forgets that the indexes were checked (a test). */
export function resetJourneyIndexCheck(): void {
  indexesCheckedAt = 0;
}

export interface JourneyWrite {
  /** The UUID of the event (lib/journey/store.ts `resolveJourneyEvent`). */
  eventId: string;
  /** The random id of the visit, or `SERVER_VISIT`. */
  session: string;
  events: readonly JourneyEvent[];
}

/**
 * Adds a batch to the daily counts and keeps its rows for 30 days. Each of the two writes can fail without the other: a failure is logged once (no content) and the batch is lost, which a
 * beacon can afford. Never throws.
 */
export async function recordJourneyBatch(db: Db, write: JourneyWrite, now: Date = new Date()): Promise<void> {
  if (write.events.length === 0) return;
  await ensureIndexesOnce(db, now.getTime());
  const day = dayOf(now);
  const durationTotals = new Map<string, number>();
  for (const event of write.events) if (event.name === 'journey.flow.complete') durationTotals.set(`${event.name}\u0000${event.key}`, (durationTotals.get(`${event.name}\u0000${event.key}`) ?? 0) + event.ms);
  const daily = rollupOf(write.events).map((row) => {
    const durationTotalMs = durationTotals.get(`${row.name}\u0000${row.key}`);
    return { updateOne: { filter: { eventId: write.eventId, day, name: row.name, key: row.key }, update: { $inc: { count: row.count, ...(durationTotalMs !== undefined ? { durationTotalMs, durationSamples: row.count } : {}) } }, upsert: true } };
  });
  const rows = write.events.map((event) => ({ eventId: write.eventId, session: write.session, name: event.name, key: event.key, ms: event.ms, at: now }));
  const outcomes = await Promise.allSettled([
    db.collection(COLLECTIONS.JOURNEY_DAILY).bulkWrite(daily, { ordered: false }),
    db.collection(COLLECTIONS.JOURNEY_EVENTS).insertMany(rows, { ordered: false }),
  ]);
  const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
  if (failed > 0) logWarn('journey.write_failed', 'A journey batch could not be written', { failed, records: write.events.length });
}

// --- the event of a beacon ---

const EVENT_TTL_MS = 5 * 60_000;
const UNKNOWN_EVENT_TTL_MS = 60_000;
const EVENT_CACHE_MAX = 500;
const eventCache = new Map<string, { eventId: string | null; at: number }>();

/** Forgets the events looked up (a test). */
export function resetJourneyEventCache(): void {
  eventCache.clear();
}

/**
 * The UUID an event is filed under, from the identifier a page names it by (its Mongo id or its UUID), or null when no such event exists. A beacon for an event that does not exist is dropped,
 * so nobody can fill the daily counts with made-up events. The answer is kept in memory for five minutes (a missing event for one), so a flood of beacons costs one lookup. Never throws.
 */
export async function resolveJourneyEvent(db: Db, identifier: string, now: number = Date.now()): Promise<string | null> {
  const hit = eventCache.get(identifier);
  if (hit && now - hit.at < (hit.eventId ? EVENT_TTL_MS : UNKNOWN_EVENT_TTL_MS)) return hit.eventId;
  try {
    const or: Array<Record<string, unknown>> = [{ eventId: identifier }];
    if (ObjectId.isValid(identifier)) or.unshift({ _id: new ObjectId(identifier) });
    const doc = await db.collection(COLLECTIONS.EVENTS).findOne({ $or: or }, { projection: { eventId: 1 } });
    const eventId = doc ? (typeof doc.eventId === 'string' && doc.eventId ? doc.eventId : String(doc._id)) : null;
    if (eventCache.size >= EVENT_CACHE_MAX) eventCache.delete(eventCache.keys().next().value as string);
    eventCache.set(identifier, { eventId, at: now });
    return eventId;
  } catch {
    return null;
  }
}

export type StoreOutcome = 'written' | 'disabled' | 'unknown_event';

/**
 * What the endpoint does with a batch once the answer is sent: nothing while the recording is switched off, nothing for an event that does not exist, else the records are written. The
 * `journey.start` record gets the kind of device the route read from the request (`device`, one of four words); the user agent itself never gets here.
 */
export async function storeJourneyBatch(db: Db, batch: JourneyBatch, device: string, now: Date = new Date()): Promise<StoreOutcome> {
  if (!(await journeyRecordingEnabled(db, now.getTime()))) return 'disabled';
  const eventId = await resolveJourneyEvent(db, batch.event, now.getTime());
  if (!eventId) return 'unknown_event';
  const events = batch.events.map((event) => {
    if (event.name === 'journey.start') return { ...event, key: device };
    if (event.name === 'photo.upload.attempt' || event.name === 'photo.upload.result' || event.name === 'photo.upload.duration') return { ...event, key: `${device}_${event.key}` };
    return event;
  });
  await recordJourneyBatch(db, { eventId, session: batch.session, events }, now);
  return 'written';
}

/**
 * Records one event the server itself sees (the public photo page opened by a person, the photo downloaded) against the event of the photo, unless the recording is switched off. For use inside `runAfterResponse`. Never throws.
 */
export async function recordServerJourney(db: Db, eventIdentifier: string | null | undefined, name: JourneyName, keyOrNow: string | Date = NO_KEY, nowArg: Date = new Date()): Promise<void> {
  try {
    const key = keyOrNow instanceof Date ? NO_KEY : keyOrNow;
    const now = keyOrNow instanceof Date ? keyOrNow : nowArg;
    if (!eventIdentifier || !(await journeyRecordingEnabled(db, now.getTime())) || !isJourneyKey(name, key)) return;
    const eventId = await resolveJourneyEvent(db, eventIdentifier, now.getTime());
    if (!eventId) return;
    await recordJourneyBatch(db, { eventId, session: SERVER_VISIT, events: [{ name, key, ms: 0 }] }, now);
  } catch {
    // a record the server makes for itself must never affect the page or the download
  }
}
