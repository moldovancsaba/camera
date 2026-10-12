import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { COUNTERS_SETTING_ID } from './counters-setting';
import type { CounterSyncResult, SyncedEvent } from './counters-sync';
import { COUNTER_TRIGGER_WINDOW_MS, requestCounterSync, type CounterTriggerDeps } from './counters-trigger';

const MESSMASS_ID = 'a'.repeat(24);
const event = (id = 'mongo-1'): SyncedEvent => ({ _id: id as unknown as ObjectId, eventId: `uuid-${id}`, messmassEventId: MESSMASS_ID });

/** A database with the setting on or off, and fakes for the sync and the clock: nothing real can be reached. */
function setup(options: { on?: boolean; result?: CounterSyncResult | 'throw' } = {}) {
  const seeded = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: options.on ? [{ settingId: COUNTERS_SETTING_ID, enabled: true }] : [] });
  const synced: Array<{ id: string }> = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const deps: CounterTriggerDeps = {
    sync: async (_db, e) => {
      synced.push({ id: String(e._id) });
      if (options.result === 'throw') throw new Error('network');
      return options.result ?? 'pushed';
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    slots: new Map(),
  };
  return { ...seeded, deps, synced, sleeps, advance: (ms: number) => void (clock += ms), slots: deps.slots };
}

const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
  const real = console.log;
  console.log = () => undefined;
  try {
    return await run();
  } finally {
    console.log = real;
  }
};

test('OFF: nothing else is read or written, the sync is not called and no slot is taken', async () => {
  const s = setup();
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'disabled');
  assert.equal(s.synced.length, 0);
  assert.equal(s.calls.length, 0, 'the fake records every write: there was none');
  assert.equal(s.slots.size, 0, 'an off setting leaves no trace, so switching it on later starts clean');
  for (const enabled of ['true', 1, null, undefined]) {
    const other = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: COUNTERS_SETTING_ID, enabled }] });
    assert.equal(await requestCounterSync(other.db, event(), s.deps), 'disabled', String(enabled));
  }
  assert.equal(s.synced.length, 0);
});

test('ON: one call asks the sync for the event, once', async () => {
  const s = setup({ on: true });
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'pushed');
  assert.deepEqual(s.synced, [{ id: 'mongo-1' }]);
});

test('a burst makes one sync at once and one more when the window ends, so the last call is always counted; the next window starts again; each event has its own window', async () => {
  const s = setup({ on: true });
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'pushed');
  s.advance(1000);
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'pushed', 'inside the window: it waits for the end of it and syncs then');
  assert.deepEqual(s.sleeps, [COUNTER_TRIGGER_WINDOW_MS - 1000]);
  assert.equal(s.synced.length, 2);
  assert.equal(await requestCounterSync(s.db, event('mongo-2'), s.deps), 'pushed', 'another event is not held back by this one');
  s.advance(COUNTER_TRIGGER_WINDOW_MS + 1);
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'pushed', 'the window has passed: a new leading sync, no wait');
  assert.deepEqual(s.synced.map((row) => row.id), ['mongo-1', 'mongo-1', 'mongo-2', 'mongo-1']);
  assert.equal(s.sleeps.length, 1);
  assert.equal(COUNTER_TRIGGER_WINDOW_MS, 15_000);
});

test('calls that arrive together make one leading sync and one shared sync after the window, never one each', async () => {
  const s = setup({ on: true });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => requestCounterSync(s.db, event(), s.deps)));
  assert.deepEqual(results, ['pushed', 'pushed', 'pushed', 'pushed', 'pushed']);
  assert.equal(s.synced.length, 2, 'the leading one and the shared one');
  assert.equal(s.sleeps.length, 1);
});

test('switching the counters off while a shared sync waits stops it', async () => {
  const s = setup({ on: true });
  assert.equal(await requestCounterSync(s.db, event(), s.deps), 'pushed');
  const waiting = requestCounterSync(s.db, event(), {
    ...s.deps,
    sleep: async (ms) => {
      await s.deps.sleep(ms);
      await s.db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: COUNTERS_SETTING_ID }, { $set: { enabled: false } });
    },
  });
  assert.equal(await waiting, 'disabled');
  assert.equal(s.synced.length, 1);
});

test('a sync that fails does not throw: the call resolves to an error result, and a sync that answers failed is passed on', async () => {
  const s = setup({ on: true, result: 'throw' });
  assert.equal(await quiet(() => requestCounterSync(s.db, event(), s.deps)), 'error');
  const failed = setup({ on: true, result: 'failed' });
  assert.equal(await requestCounterSync(failed.db, event(), failed.deps), 'failed');
});

test('a database that cannot be read does not throw either, and nothing is synced', async () => {
  const s = setup({ on: true });
  const broken = { collection: () => ({ findOne: async () => { throw new Error('database'); } }) } as never;
  assert.equal(await quiet(() => requestCounterSync(broken, event(), s.deps)), 'error');
  assert.equal(await quiet(() => requestCounterSync(undefined as never, event(), s.deps)), 'error');
  assert.equal(s.synced.length, 0);
});

test('it never delays the caller: the call returns before the work is done, so a request that does not await it is not held', async () => {
  const s = setup({ on: true });
  let finished = false;
  const slow: CounterTriggerDeps = { ...s.deps, sync: async () => { await new Promise((resolve) => setTimeout(resolve, 30)); finished = true; return 'pushed'; } };
  const pending = requestCounterSync(s.db, event(), slow);
  assert.equal(finished, false, 'the caller is back with the work still running');
  assert.equal(await pending, 'pushed');
  assert.equal(finished, true);
});

test('the map of slots does not grow without end: events quiet for a window are forgotten', async () => {
  const s = setup({ on: true });
  for (let i = 0; i < 600; i += 1) await requestCounterSync(s.db, event(`e${i}`), s.deps);
  s.advance(COUNTER_TRIGGER_WINDOW_MS + 1);
  await requestCounterSync(s.db, event('fresh'), s.deps);
  assert.ok(s.slots.size < 10, `kept ${s.slots.size}`);
});

test('with the real sync behind it: off does nothing, and on for an event that is not linked to messmass reaches the sync and sends nothing', async () => {
  const off = fakeDb();
  assert.equal(await requestCounterSync(off.db, event('real-off')), 'disabled');
  assert.equal(off.calls.length, 0);
  const on = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: COUNTERS_SETTING_ID, enabled: true }], [COLLECTIONS.EVENTS]: [{ _id: 'real-on', eventId: 'uuid-real-on' }] });
  assert.equal(await requestCounterSync(on.db, { _id: 'real-on' as unknown as ObjectId, eventId: 'uuid-real-on' }), 'not_linked');
  assert.equal(on.calls.length, 0, 'not linked: nothing was claimed, computed or sent');
});
