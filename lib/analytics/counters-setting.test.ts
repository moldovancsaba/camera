import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { COUNTERS_SETTING_ID, DEFAULT_COUNTERS_SETTING, getCountersSetting, setCountersSetting } from './counters-setting';

test('off by default: with nothing stored the counters are off', async () => {
  const { db } = fakeDb();
  assert.deepEqual(await getCountersSetting(db), DEFAULT_COUNTERS_SETTING);
  assert.equal(DEFAULT_COUNTERS_SETTING.enabled, false);
});

test('only a stored true is on: a missing field, a text, a number or anything else is off', async () => {
  for (const enabled of [undefined, 'true', 1, 'yes', null, {}]) {
    const { db } = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: COUNTERS_SETTING_ID, enabled }] });
    assert.equal((await getCountersSetting(db)).enabled, false, String(enabled));
  }
  const { db } = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: COUNTERS_SETTING_ID, enabled: true, updatedAt: '2026-10-20T10:00:00.000Z', updatedBy: 'owner@club.test' }] });
  assert.deepEqual(await getCountersSetting(db), { settingId: COUNTERS_SETTING_ID, enabled: true, updatedAt: '2026-10-20T10:00:00.000Z', updatedBy: 'owner@club.test' });
});

test('another setting in the same collection does not switch it on', async () => {
  const { db } = fakeDb({ [COLLECTIONS.ADMIN_SETTINGS]: [{ settingId: 'defaults-rollout', enabled: true }] });
  assert.equal((await getCountersSetting(db)).enabled, false);
});

test('switching it on and off stores who and when, in one document', async () => {
  const { db, data } = fakeDb();
  const on = await setCountersSetting(db, true, 'owner@club.test', new Date('2026-10-20T10:00:00.000Z'));
  assert.deepEqual(on, { settingId: COUNTERS_SETTING_ID, enabled: true, updatedAt: '2026-10-20T10:00:00.000Z', updatedBy: 'owner@club.test' });
  assert.equal((await getCountersSetting(db)).enabled, true);
  await setCountersSetting(db, false, 'owner@club.test', new Date('2026-10-20T11:00:00.000Z'));
  assert.equal((await getCountersSetting(db)).enabled, false);
  assert.equal(data[COLLECTIONS.ADMIN_SETTINGS].length, 1);
});
