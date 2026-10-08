import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DEFAULTS_ROLLOUT, eventGetsDefaults, getDefaultsRollout } from './defaults-rollout';

test('the defaults reach an event created with them, and every event once the switch is on, and no other', () => {
  const off = { applyToExistingEvents: false };
  const on = { applyToExistingEvents: true };
  assert.equal(eventGetsDefaults({ journeyDefaults: true }, off), true);
  assert.equal(eventGetsDefaults({}, off), false, 'an existing event is left alone while the switch is off');
  assert.equal(eventGetsDefaults({ journeyDefaults: false }, off), false);
  assert.equal(eventGetsDefaults({}, on), true);
  assert.equal(eventGetsDefaults({ journeyDefaults: 'yes' }, off), false, 'only a real true counts');
});

test('the switch is off until an admin turns it on, and a stored value is read as a real boolean', async () => {
  const db = (stored: unknown) => ({ collection: () => ({ findOne: async () => stored }) }) as never;
  assert.deepEqual(await getDefaultsRollout(db(null)), DEFAULT_DEFAULTS_ROLLOUT);
  assert.equal((await getDefaultsRollout(db({ settingId: 'defaults-rollout', applyToExistingEvents: true, updatedAt: 't', updatedBy: 'a@b.c' }))).applyToExistingEvents, true);
  assert.equal((await getDefaultsRollout(db({ applyToExistingEvents: 'true' }))).applyToExistingEvents, false);
});
