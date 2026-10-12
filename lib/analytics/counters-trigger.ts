/**
 * The way a live path asks for the counters of an event to be pushed to messmass (issue 628): a vetting decision, a saved marking of the people. One call, `requestCounterSync(db, event)`, that is
 * **fire-and-forget**: it never throws, and it never makes the caller wait (do not await it in a request; the promise it returns always resolves, for a test or for `after()`).
 *
 * The order is the safe one. First the setting (lib/analytics/counters-setting.ts): **while it is off nothing else is read or written**, so the call costs one read of one small document and
 * nothing more. When it is on, the call is **debounced in this server instance**: at most one sync per event per 30 seconds, so a reviewer marking photo after photo does not start a push for each.
 * The claim inside `syncEventCounters` still protects across instances. A request inside the window is dropped, not delayed: the numbers it would have added go with the next request or with a
 * later catch-up sync, because every push is a whole running total (nothing is lost, only late). The tests run it against fakes only (no database, no network, CLAUDE.md section 8).
 */

import type { Db } from 'mongodb';
import { logWarn } from '@/lib/observability/logger';
import { getCountersSetting } from './counters-setting';
import { syncEventCounters, type CounterSyncResult, type SyncedEvent } from './counters-sync';

export const COUNTER_TRIGGER_WINDOW_MS = 30_000;

/** What a request did: the result of the sync, or why there was none. */
export type CounterTriggerResult = CounterSyncResult | 'debounced' | 'error';

export interface CounterTriggerDeps {
  sync: (db: Db, event: SyncedEvent) => Promise<CounterSyncResult>;
  now: () => number;
  /** When each event was last let through, by event id: one map for the instance. */
  slots: Map<string, number>;
}

const realDeps: CounterTriggerDeps = { sync: (db, event) => syncEventCounters(db, event), now: () => Date.now(), slots: new Map() };

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

  // Claim the slot in the same step as the check, so two requests arriving together make one sync.
  const key = String(event._id);
  const now = deps.now();
  const last = deps.slots.get(key);
  if (last !== undefined && now - last < COUNTER_TRIGGER_WINDOW_MS) return 'debounced';
  deps.slots.set(key, now);
  // Forget events that have been quiet for a window, so the map stays as small as the busy events.
  if (deps.slots.size > 500) for (const [slot, at] of deps.slots) if (now - at >= COUNTER_TRIGGER_WINDOW_MS) deps.slots.delete(slot);

  return deps.sync(db, event);
}
