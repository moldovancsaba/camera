/**
 * The way a live path asks for the counters of an event to be pushed to messmass (issue 628): a vetting decision, a saved marking of the people. One call, `requestCounterSync(db, event)`, that is
 * **fire-and-forget**: it never throws, and it never makes the caller wait (do not await it in a request; wrap it in `after()`: the promise it returns always resolves).
 *
 * The order is the safe one. First the setting (lib/analytics/counters-setting.ts): **while it is off nothing else is read or written**, so the call costs one read of one small document and
 * nothing more. When it is on, the first call of a burst syncs at once, and every other call inside the next 15 seconds shares **one more sync that runs when the window ends**, so a reviewer
 * deciding photo after photo does not start a push for each, and **the last decision of a burst is always in the totals** (a push is a whole running total computed from the database at that
 * moment). The shared run checks the setting again, so switching the counters off stops it. The claim inside `syncEventCounters` still protects across instances. The tests run it against
 * fakes only (no database, no network, CLAUDE.md section 8).
 */

import type { Db, ObjectId } from 'mongodb';
import { after } from 'next/server';
import { logWarn } from '@/lib/observability/logger';
import { getCountersSetting } from './counters-setting';
import { syncEventCounters, type CounterSyncResult, type SyncedEvent } from './counters-sync';

export const COUNTER_TRIGGER_WINDOW_MS = 15_000;

/** What a request did: the result of the sync it started or shared, or why there was none. */
export type CounterTriggerResult = CounterSyncResult | 'error';

interface Slot {
  /** When the last sync of the event started in this instance. */
  last: number;
  /** The run waiting for the window to end, shared by every call that comes meanwhile. */
  trailing: Promise<CounterTriggerResult> | null;
}

export interface CounterTriggerDeps {
  sync: (db: Db, event: SyncedEvent) => Promise<CounterSyncResult>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** One map for the instance, by event id. */
  slots: Map<string, Slot>;
}

const realDeps: CounterTriggerDeps = {
  sync: (db, event) => syncEventCounters(db, event),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  slots: new Map(),
};

/** Asks for a sync of the event's counters. Never throws and never needs awaiting; resolves to what happened. */
export function requestCounterSync(db: Db, event: SyncedEvent, deps: CounterTriggerDeps = realDeps): Promise<CounterTriggerResult> {
  return run(db, event, deps).catch((error: unknown) => {
    logWarn('counters.trigger_failed', 'A sync of the counters for messmass could not be requested', { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
    return 'error' as const;
  });
}

async function run(db: Db, event: SyncedEvent, deps: CounterTriggerDeps): Promise<CounterTriggerResult> {
  // The setting first: off (the default) means nothing else is touched.
  if (!(await getCountersSetting(db)).enabled) return 'disabled';

  // Claim or join in the same step as the check, so calls arriving together make one leading and one shared run.
  const key = String(event._id);
  const now = deps.now();
  // Forget events that have been quiet for a window, so the map stays as small as the busy events.
  if (deps.slots.size > 500) for (const [id, slot] of deps.slots) if (!slot.trailing && now - slot.last >= COUNTER_TRIGGER_WINDOW_MS) deps.slots.delete(id);

  const slot = deps.slots.get(key);
  if (!slot || (!slot.trailing && now - slot.last >= COUNTER_TRIGGER_WINDOW_MS)) {
    deps.slots.set(key, { last: now, trailing: null });
    return deps.sync(db, event);
  }
  if (slot.trailing) return slot.trailing;

  const wait = Math.max(0, slot.last + COUNTER_TRIGGER_WINDOW_MS - now);
  slot.trailing = (async (): Promise<CounterTriggerResult> => {
    try {
      await deps.sleep(wait);
    } finally {
      slot.last = deps.now();
      slot.trailing = null;
    }
    // The owner may have switched the counters off while this waited.
    if (!(await getCountersSetting(db)).enabled) return 'disabled';
    return deps.sync(db, event);
  })();
  return slot.trailing;
}

/** The few fields the sync needs from a stored event document; null when the document cannot be synced (no id, no event id). */
export function syncedEventOf(event: Record<string, unknown> | null | undefined): SyncedEvent | null {
  if (!event || !event._id || typeof event.eventId !== 'string' || !event.eventId) return null;
  return {
    _id: event._id as ObjectId,
    eventId: event.eventId,
    messmassEventId: typeof event.messmassEventId === 'string' ? event.messmassEventId : null,
    partnerId: event.partnerId,
  };
}

/**
 * What a live path calls after it saved something the counters read (a decision, the people of a photo): it asks for the push **after the response** (`after()`), so the reviewer never waits.
 * Outside a request nothing is scheduled; while the counters are off the scheduled call reads one setting and stops.
 */
export function scheduleCounterSync(db: Db, event: Record<string, unknown> | null | undefined): void {
  const synced = syncedEventOf(event);
  if (!synced) return;
  try {
    after(() => requestCounterSync(db, synced));
  } catch {
    // not in a request: the next decision, or a catch-up, pushes the totals
  }
}
