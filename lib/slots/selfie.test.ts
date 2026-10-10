import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SELFIE_SLOT, pickSelfie, resolvePartnerSelfies, resolveSelfies } from './selfie';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);
const GLOBAL = ['g1', 'g2', 'g3'];

test('an event with nothing stored follows its partner, which follows the global set: nothing is copied', () => {
  assert.deepEqual(ids(resolveSelfies(GLOBAL, {}, {})), ['g1', 'g2', 'g3']);
  assert.deepEqual(ids(resolveSelfies(GLOBAL, null, null)), ['g1', 'g2', 'g3']);
  assert.deepEqual(resolveSelfies(GLOBAL, {}, {}).map((item) => item.level), ['global', 'global', 'global']);
  assert.deepEqual(ids(resolveSelfies([], {}, {})), [], 'no global selfie: nothing to use, the stand-in is drawn');
});

test('a partner adds more, replaces or shows none, and its events follow that', () => {
  const add = { slots: { [SELFIE_SLOT]: { items: ['p1'] } } };
  assert.deepEqual(ids(resolvePartnerSelfies(GLOBAL, add)), ['p1', 'g1', 'g2', 'g3']);
  const replace = { slots: { [SELFIE_SLOT]: { items: ['p1', 'p2'], useDefault: false } } };
  assert.deepEqual(ids(resolveSelfies(GLOBAL, replace, {})), ['p1', 'p2']);
  const none = { slots: { [SELFIE_SLOT]: { useDefault: false } } };
  assert.deepEqual(ids(resolveSelfies(GLOBAL, none, {})), []);
});

test('an event adds its own, replaces what it follows, or shows none, and a change above shows at once on an event that stored nothing', () => {
  const partner = { slots: { [SELFIE_SLOT]: { items: ['p1'], useDefault: false } } };
  const own = { slots: { [SELFIE_SLOT]: { items: ['e1'] } } };
  assert.deepEqual(ids(resolveSelfies(GLOBAL, partner, own)), ['e1', 'p1']);
  assert.deepEqual(ids(resolveSelfies(GLOBAL, partner, { slots: { [SELFIE_SLOT]: { items: ['e1'], useDefault: false } } })), ['e1']);
  assert.deepEqual(ids(resolveSelfies(GLOBAL, partner, { slots: { [SELFIE_SLOT]: { useDefault: false } } })), []);
  assert.deepEqual(ids(resolveSelfies(GLOBAL, partner, {})), ['p1']);
  assert.deepEqual(ids(resolveSelfies(['g9'], partner, {})), ['p1'], 'a partner that replaced does not get a new global one');
  assert.deepEqual(ids(resolveSelfies(['g9'], {}, {})), ['g9'], 'a follower gets it at once');
});

test('the pick is stored once: it stays while it is in the set, is random otherwise, and "again" picks another', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id, level: 'global' }));
  assert.equal(pickSelfie(items, 'b', { random: () => 0 }), 'b', 'the stored pick stays');
  assert.equal(pickSelfie(items, 'gone', { random: () => 0.99 }), 'c', 'a pick that left the set is replaced by a random one');
  assert.equal(pickSelfie(items, null, { random: () => 0 }), 'a');
  assert.equal(pickSelfie(items, 'a', { again: true, random: () => 0 }), 'b', 'again: never the same one when there is a choice');
  assert.equal(pickSelfie([{ id: 'only', level: 'global' }], 'only', { again: true }), 'only', 'a single item stays');
  assert.equal(pickSelfie([], 'x'), null);
});
