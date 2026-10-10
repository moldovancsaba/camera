import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { PhotoStatsPayload } from '@/lib/messmassClient';
import type { CounterSet } from './counters';
import { COUNTERS_SETTING_ID } from './counters-setting';
import { COUNTER_SYNC_THROTTLE_MS, loadEventCounters, syncEventCounters, type CounterSyncDeps } from './counters-sync';

const T0 = new Date('2026-10-20T18:00:00.000Z');
const MESSMASS_ID = 'a'.repeat(24);
const COUNTERS: CounterSet = { totals: { imagesTaken: 5, imagesApproved: 3, imagesRejected: 1, imagesShownOnSlideshow: 40, consentAccepted: 4 }, averages: { avgVettingSeconds: 90 } };

/** One linked event, the setting on or off, and fakes for the push and the counters: nothing real can be reached. */
function setup(options: { on?: boolean; linked?: string | null; counterSync?: Record<string, unknown>; counters?: CounterSet } = {}) {
  const event = { _id: 'mongo-1' as unknown as ObjectId, eventId: 'ev-1', ...(options.linked === null ? {} : { messmassEventId: options.linked ?? MESSMASS_ID }), ...(options.counterSync ? { counterSync: options.counterSync } : {}) };
  const seeded = fakeDb({
    [COLLECTIONS.EVENTS]: [event],
    [COLLECTIONS.ADMIN_SETTINGS]: options.on ? [{ settingId: COUNTERS_SETTING_ID, enabled: true }] : [],
  });
  const pushed: Array<{ id: string; payload: PhotoStatsPayload }> = [];
  let loaded = 0;
  const deps = (ok = true, now = T0, counters = options.counters ?? COUNTERS): CounterSyncDeps => ({
    push: async (id, payload) => {
      pushed.push({ id, payload });
      return ok;
    },
    counters: async () => {
      loaded += 1;
      return counters;
    },
    now: () => now,
  });
  return { ...seeded, event, pushed, deps, loaded: () => loaded, stored: () => seeded.data[COLLECTIONS.EVENTS][0] };
}

test('OFF BY DEFAULT: with no setting stored nothing is computed, nothing is sent and nothing is written', async () => {
  const s = setup();
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'disabled');
  assert.equal(await syncEventCounters(s.db, s.event, { force: true }, s.deps()), 'disabled', 'not even a forced call');
  assert.equal(s.pushed.length, 0);
  assert.equal(s.loaded(), 0, 'the photos are not even read');
  assert.equal(s.calls.length, 0, 'the fake records every write: there was none');
  assert.equal(s.stored().counterSync, undefined);
});

test('a setting that is not a real true keeps it off', async () => {
  for (const enabled of ['true', 1, null]) {
    const s = fakeDb({ [COLLECTIONS.EVENTS]: [{ _id: 'mongo-1', eventId: 'ev-1', messmassEventId: MESSMASS_ID }], [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: COUNTERS_SETTING_ID, enabled }] });
    let pushes = 0;
    const deps: CounterSyncDeps = { push: async () => (pushes += 1, true), counters: async () => COUNTERS, now: () => T0 };
    assert.equal(await syncEventCounters(s.db, { _id: 'mongo-1' as unknown as ObjectId, eventId: 'ev-1', messmassEventId: MESSMASS_ID }, {}, deps), 'disabled', String(enabled));
    assert.equal(pushes, 0);
  }
});

test('on, but the event is not linked to messmass (or the id is malformed): nothing is sent', async () => {
  for (const linked of [null, '', 'not-an-id', '../admin']) {
    const s = setup({ on: true, linked });
    assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'not_linked', String(linked));
    assert.equal(s.pushed.length, 0);
    assert.equal(s.loaded(), 0);
  }
});

test('the first push sends the whole totals and the averages under their names, and remembers them with the time', async () => {
  const s = setup({ on: true });
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'pushed');
  assert.deepEqual(s.pushed, [{ id: MESSMASS_ID, payload: { totals: COUNTERS.totals, averages: COUNTERS.averages } }]);
  assert.deepEqual(s.stored().counterSync, { pushedAt: T0.toISOString(), counters: COUNTERS });
});

test('inside the throttle window nothing is sent, and after it the new numbers are', async () => {
  const s = setup({ on: true, counterSync: { pushedAt: new Date(T0.getTime() - COUNTER_SYNC_THROTTLE_MS + 1000).toISOString(), counters: { totals: { imagesTaken: 1 }, averages: {} } } });
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'throttled');
  assert.equal(s.pushed.length, 0);
  assert.equal(s.loaded(), 0, 'a throttled call does not even read the photos');
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps(true, new Date(T0.getTime() + 2000))), 'pushed');
  assert.equal(s.pushed.length, 1);
});

test('numbers that have not changed since the last good push are not sent again, unless forced', async () => {
  const s = setup({ on: true, counterSync: { pushedAt: new Date(T0.getTime() - 5 * COUNTER_SYNC_THROTTLE_MS).toISOString(), counters: COUNTERS } });
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'unchanged');
  assert.equal(s.pushed.length, 0);
  assert.equal(await syncEventCounters(s.db, s.event, { force: true }, s.deps()), 'pushed');
  assert.equal(s.pushed.length, 1);
});

test('a refused push is a failure and does not remember the numbers, so the next call sends them again', async () => {
  const s = setup({ on: true });
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps(false)), 'failed');
  assert.equal((s.stored().counterSync as { counters?: unknown }).counters, undefined);
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps(true, new Date(T0.getTime() + COUNTER_SYNC_THROTTLE_MS + 1))), 'pushed');
});

test('no numbers at all: nothing is sent (never an empty push)', async () => {
  const s = setup({ on: true, counters: { totals: {}, averages: {} } });
  assert.equal(await syncEventCounters(s.db, s.event, {}, s.deps()), 'nothing_to_send');
  assert.equal(s.pushed.length, 0);
});

test('it never throws: a failing read or push is a failed result, so a hook in a live path needs no guard', async () => {
  const s = setup({ on: true });
  const failing: CounterSyncDeps = { push: async () => { throw new Error('network'); }, counters: async () => COUNTERS, now: () => T0 };
  const quiet = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await syncEventCounters(s.db, s.event, {}, failing), 'failed');
    const readFails: CounterSyncDeps = { push: async () => true, counters: async () => { throw new Error('database'); }, now: () => new Date(T0.getTime() + 60_000) };
    assert.equal(await syncEventCounters(s.db, s.event, {}, readFails), 'failed');
  } finally {
    console.error = quiet;
  }
});

test('the counters are made from the photos of the event only, over the whole event, as numbers', async () => {
  const photo = (id: string, extra: Record<string, unknown> = {}) => ({ _id: id, eventId: 'ev-1', eventIds: ['ev-1'], submissionKind: 'original', createdAt: '2026-10-16T18:00:00.000Z', isArchived: false, userId: 'anonymous', userEmail: 'anonymous@event', ...extra });
  const { db } = fakeDb({
    [COLLECTIONS.SUBMISSIONS]: [
      photo('a', { reviewStatus: 'approved', playCount: 3, photoReview: { submittedAt: '2026-10-16T18:00:00.000Z' }, reviewHistory: [{ action: 'approve', by: 'ann', at: '2026-10-16T18:01:00.000Z' }], consents: [{ pageType: 'accept', checkboxText: 'x', accepted: true }] }),
      photo('b', { reviewStatus: 'rejected', photoReview: { submittedAt: '2026-10-16T18:00:00.000Z' }, reviewHistory: [{ action: 'reject', by: 'ann', at: '2026-10-16T18:03:00.000Z', reason: 'Blurry' }] }),
      photo('c', { reviewStatus: 'pending_review' }),
      photo('other', { eventId: 'ev-2', eventIds: ['ev-2'], reviewStatus: 'approved', playCount: 99 }),
      photo('t', { submissionKind: 'tryon_result', reviewStatus: 'approved', playCount: 50 }),
    ],
  });
  assert.deepEqual(await loadEventCounters(db, { eventId: 'ev-1' }), { totals: { imagesTaken: 3, imagesApproved: 1, imagesRejected: 1, imagesShownOnSlideshow: 3, consentAccepted: 1 }, averages: { avgVettingSeconds: 120 } });
});

test('the state for the Messmass tab: the setting, the link, the numbers now and the last push, and nothing is written or sent', async () => {
  const { db, calls } = fakeDb({
    [COLLECTIONS.SUBMISSIONS]: [{ _id: 'a', eventId: 'ev-1', eventIds: ['ev-1'], submissionKind: 'original', createdAt: '2026-10-16T18:00:00.000Z', isArchived: false, reviewStatus: 'approved' }],
  });
  const { loadCounterState } = await import('./counters-sync');
  const state = await loadCounterState(db, { eventId: 'ev-1', messmassEventId: MESSMASS_ID, counterSync: { pushedAt: '2026-10-20T18:00:00.000Z', counters: COUNTERS } });
  assert.equal(state.enabled, false);
  assert.equal(state.linked, true);
  assert.equal(state.counters.totals.imagesTaken, 1);
  assert.equal(state.lastPushAt, '2026-10-20T18:00:00.000Z');
  assert.deepEqual(state.lastPushed, COUNTERS);
  assert.equal(calls.length, 0);
  const unlinked = await loadCounterState(db, { eventId: 'ev-1' });
  assert.deepEqual([unlinked.linked, unlinked.lastPushAt, unlinked.lastPushed], [false, null, null]);
});
