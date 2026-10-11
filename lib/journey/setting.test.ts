import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Db } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { DEFAULT_JOURNEY_SETTING, JOURNEY_SETTING_ID, JOURNEY_SETTING_TTL_MS, getJourneySetting, journeyRecordingEnabled, resetJourneySettingCache, setJourneySetting } from './setting';

beforeEach(() => resetJourneySettingCache());

test('the recording is on by default: no document, a document without the field, text or anything else is still on; only a stored false turns it off', async () => {
  assert.equal((await getJourneySetting(fakeDb().db)).enabled, true);
  assert.deepEqual(await getJourneySetting(fakeDb().db), DEFAULT_JOURNEY_SETTING);
  for (const stored of [{}, { enabled: 'false' }, { enabled: 0 }, { enabled: null }, { enabled: true }]) {
    assert.equal((await getJourneySetting(fakeDb({ admin_settings: [{ settingId: JOURNEY_SETTING_ID, ...stored }] }).db)).enabled, true, JSON.stringify(stored));
  }
  assert.equal((await getJourneySetting(fakeDb({ admin_settings: [{ settingId: JOURNEY_SETTING_ID, enabled: false, updatedAt: '2026-10-15T08:00:00.000Z', updatedBy: 'a@example.test' }] }).db)).enabled, false);
});

test('switching it off is stored with who and when, takes effect at once on this instance, and switching it on again restores it', async () => {
  const w = fakeDb();
  const off = await setJourneySetting(w.db, false, 'owner@example.test', new Date('2026-10-15T08:00:00.000Z'));
  assert.deepEqual(off, { settingId: JOURNEY_SETTING_ID, enabled: false, updatedAt: '2026-10-15T08:00:00.000Z', updatedBy: 'owner@example.test' });
  assert.equal(w.data.admin_settings.length, 1);
  assert.equal(await journeyRecordingEnabled(w.db), false);
  await setJourneySetting(w.db, true, 'owner@example.test');
  assert.equal(await journeyRecordingEnabled(w.db), true);
  assert.equal(w.data.admin_settings.length, 1, 'one document, updated');
});

test('the value is kept in memory for a short time, so a flood of beacons costs one read; after that it is read again', async () => {
  const w = fakeDb({ admin_settings: [{ settingId: JOURNEY_SETTING_ID, enabled: false }] });
  let reads = 0;
  const counting = { collection: (name: string) => { const c = w.db.collection(name); return { findOne: async (...args: Parameters<typeof c.findOne>) => { reads += 1; return c.findOne(...args); } }; } } as unknown as Db;
  const t0 = 1_000_000;
  for (let i = 0; i < 50; i += 1) assert.equal(await journeyRecordingEnabled(counting, t0 + i), false);
  assert.equal(reads, 1);
  w.data.admin_settings[0].enabled = true; // changed by another server
  assert.equal(await journeyRecordingEnabled(counting, t0 + JOURNEY_SETTING_TTL_MS - 1), false, 'still the kept value');
  assert.equal(await journeyRecordingEnabled(counting, t0 + JOURNEY_SETTING_TTL_MS + 1), true, 'read again after the time');
  assert.equal(reads, 2);
});

test('a read that fails leaves the recording on and is not kept, so the next call tries again', async () => {
  let fail = true;
  const db = { collection: () => ({ findOne: async () => { if (fail) throw new Error('database down'); return { settingId: JOURNEY_SETTING_ID, enabled: false }; } }) } as unknown as Db;
  assert.equal(await journeyRecordingEnabled(db, 5), true);
  fail = false;
  assert.equal(await journeyRecordingEnabled(db, 6), false);
});
