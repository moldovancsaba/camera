import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SELFIE_SLOT, resolveSelfies } from './selfie';
import { STADIUM_SLOT, pickStadium, resolvePartnerStadiums, resolveStadiums } from './stadium';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);
const GLOBAL = ['g1', 'g2', 'g3'];

test('an event with nothing stored follows its partner, which follows the global set: nothing is copied', () => {
  assert.deepEqual(ids(resolveStadiums(GLOBAL, {}, {})), ['g1', 'g2', 'g3']);
  assert.deepEqual(ids(resolveStadiums(GLOBAL, null, null)), ['g1', 'g2', 'g3']);
  assert.deepEqual(resolveStadiums(GLOBAL, {}, {}).map((item) => item.level), ['global', 'global', 'global']);
  assert.deepEqual(ids(resolveStadiums([], {}, {})), [], 'no global stadium background: nothing to use, the built-in stage is drawn');
});

test('a partner adds more, replaces or shows none, and its events follow that', () => {
  const add = { slots: { [STADIUM_SLOT]: { items: ['p1'] } } };
  assert.deepEqual(ids(resolvePartnerStadiums(GLOBAL, add)), ['p1', 'g1', 'g2', 'g3']);
  const replace = { slots: { [STADIUM_SLOT]: { items: ['p1', 'p2'], useDefault: false } } };
  assert.deepEqual(ids(resolveStadiums(GLOBAL, replace, {})), ['p1', 'p2']);
  const none = { slots: { [STADIUM_SLOT]: { useDefault: false } } };
  assert.deepEqual(ids(resolveStadiums(GLOBAL, none, {})), []);
});

test('an event adds its own, replaces what it follows, or shows none, and a change above shows at once on an event that stored nothing', () => {
  const partner = { slots: { [STADIUM_SLOT]: { items: ['p1'], useDefault: false } } };
  const own = { slots: { [STADIUM_SLOT]: { items: ['e1'] } } };
  assert.deepEqual(ids(resolveStadiums(GLOBAL, partner, own)), ['e1', 'p1']);
  assert.deepEqual(ids(resolveStadiums(GLOBAL, partner, { slots: { [STADIUM_SLOT]: { items: ['e1'], useDefault: false } } })), ['e1']);
  assert.deepEqual(ids(resolveStadiums(GLOBAL, partner, { slots: { [STADIUM_SLOT]: { useDefault: false } } })), []);
  assert.deepEqual(ids(resolveStadiums(GLOBAL, partner, {})), ['p1']);
  assert.deepEqual(ids(resolveStadiums(['g9'], partner, {})), ['p1'], 'a partner that replaced does not get a new global one');
  assert.deepEqual(ids(resolveStadiums(['g9'], {}, {})), ['g9'], 'a follower gets it at once');
});

test('the pick is stored once: it stays while it is in the set, is random otherwise, and "again" picks another', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id, level: 'global' }));
  assert.equal(pickStadium(items, 'b', { random: () => 0 }), 'b', 'the stored pick stays');
  assert.equal(pickStadium(items, 'gone', { random: () => 0.99 }), 'c', 'a pick that left the set is replaced by a random one');
  assert.equal(pickStadium(items, null, { random: () => 0 }), 'a');
  assert.equal(pickStadium(items, 'a', { again: true, random: () => 0 }), 'b', 'again: never the same one when there is a choice');
  assert.equal(pickStadium([{ id: 'only', level: 'global' }], 'only', { again: true }), 'only', 'a single item stays');
  assert.equal(pickStadium([], 'x'), null);
});

test('the stadium slot and the sample selfie slot are two slots: what a level stores for one never reaches the other', () => {
  const partner = { slots: { [SELFIE_SLOT]: { items: ['s1'], useDefault: false } } };
  assert.deepEqual(ids(resolveStadiums(GLOBAL, partner, {})), ['g1', 'g2', 'g3'], 'a partner that replaced its sample selfies still follows the global stadium backgrounds');
  assert.deepEqual(ids(resolveSelfies(GLOBAL, partner, {})), ['s1']);
  assert.notEqual(STADIUM_SLOT, SELFIE_SLOT);
});
