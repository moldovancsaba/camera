import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLibraryEdit, assignedFromGlobal, canEventAssign, canPartnerAssign, scopeOf } from './rules';
import { eventAssignedIds, parseKind, partnerDefaultIds, partnerSavedIds } from './kinds';

test('an item without a scope is global: everything that existed before the libraries', () => {
  assert.equal(scopeOf({}), 'global');
  assert.equal(scopeOf(null), 'global');
  assert.equal(scopeOf({ scope: 'global' }), 'global');
  assert.equal(scopeOf({ scope: 'partner', partnerId: 'p1' }), 'partner');
  assert.equal(scopeOf({ scope: 'event', eventId: 'e1' }), 'event');
  assert.equal(scopeOf({ scope: 'planet' as never }), 'global', 'an unknown scope does not make an item private');
});

test('a partner takes items of the global library only', () => {
  assert.deepEqual(canPartnerAssign({}, 'frame'), { ok: true });
  assert.deepEqual(canPartnerAssign({ scope: 'global' }, 'frame'), { ok: true });
  const own = canPartnerAssign({ scope: 'partner', partnerId: 'p2' }, 'frame');
  assert.equal(own.ok, false);
  assert.match(own.ok ? '' : own.reason, /uploaded for a partner/);
  const upload = canPartnerAssign({ scope: 'event', eventId: 'e1' }, 'logo');
  assert.equal(upload.ok, false);
  assert.match(upload.ok ? '' : upload.reason, /one event.*logo|logo.*one event/);
});

const ctx = (over: Partial<Parameters<typeof canEventAssign>[1]> = {}) => ({
  noun: 'frame',
  itemId: 'f1',
  eventId: 'e1',
  partnerId: 'p1',
  partnerLibrary: new Set(['f1']),
  ...over,
});

test('an event takes a global item only when its partner has it in the library', () => {
  assert.deepEqual(canEventAssign({}, ctx()), { ok: true });
  const missing = canEventAssign({}, ctx({ partnerLibrary: new Set() }));
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? '' : missing.reason, /not in the partner's library/);
});

test("an event takes its partner's own uploads and its own uploads, nobody else's", () => {
  assert.deepEqual(canEventAssign({ scope: 'partner', partnerId: 'p1' }, ctx({ partnerLibrary: new Set() })), { ok: true });
  assert.equal(canEventAssign({ scope: 'partner', partnerId: 'p2' }, ctx()).ok, false, 'another partner');
  assert.deepEqual(canEventAssign({ scope: 'event', eventId: 'e1' }, ctx({ partnerLibrary: new Set() })), { ok: true });
  assert.equal(canEventAssign({ scope: 'event', eventId: 'e2' }, ctx()).ok, false, 'another event');
});

test('an event without a partner has no library to take from, except its own uploads', () => {
  const none = canEventAssign({}, ctx({ partnerId: null }));
  assert.equal(none.ok, false);
  assert.match(none.ok ? '' : none.reason, /no partner/);
  assert.equal(canEventAssign({ scope: 'partner', partnerId: 'p1' }, ctx({ partnerId: null })).ok, false);
  assert.deepEqual(canEventAssign({ scope: 'event', eventId: 'e1' }, ctx({ partnerId: null })), { ok: true });
});

test('a partner that has not saved a library keeps what it had: its defaults and what its events already use, once each', () => {
  assert.deepEqual(assignedFromGlobal({ saved: undefined, defaults: ['a', 'b'], usedByEvents: ['b', 'c'] }), { ids: ['a', 'b', 'c'], saved: false });
  assert.deepEqual(assignedFromGlobal({ saved: undefined, defaults: [], usedByEvents: [] }), { ids: [], saved: false });
});

test('a saved library is the list itself, even when empty: later use or defaults do not add to it', () => {
  assert.deepEqual(assignedFromGlobal({ saved: ['a'], defaults: ['b'], usedByEvents: ['c'] }), { ids: ['a'], saved: true });
  assert.deepEqual(assignedFromGlobal({ saved: [], defaults: ['b'], usedByEvents: ['c'] }), { ids: [], saved: true });
});

test('an edit adds, then removes; an id in both stays removed; order is kept', () => {
  assert.deepEqual(applyLibraryEdit(['a', 'b'], ['c', 'a'], ['b']), ['a', 'c']);
  assert.deepEqual(applyLibraryEdit(['a'], ['b'], ['b']), ['a']);
  assert.deepEqual(applyLibraryEdit([], [], []), []);
});

test('the kinds are read from a request value, and the ids of a kind from an event and a partner', () => {
  assert.equal(parseKind('frames'), 'frames');
  assert.equal(parseKind('logos'), 'logos');
  assert.equal(parseKind('images'), 'images');
  for (const bad of ['fonts', '', null, undefined, 7, 'Frames']) assert.equal(parseKind(bad), null, String(bad));

  const event = { frames: [{ frameId: 'f1' }, { frameId: 'f1' }, { frameId: 'f2' }, null, { nope: 1 }], logos: [{ logoId: 'l1', scenario: 'a' }, { logoId: 'l1', scenario: 'b' }] };
  assert.deepEqual(eventAssignedIds('frames', event), ['f1', 'f2']);
  assert.deepEqual(eventAssignedIds('logos', event), ['l1'], 'one logo in two scenarios is one item');
  assert.deepEqual(eventAssignedIds('frames', {}), []);
  assert.deepEqual(eventAssignedIds('frames', null), []);

  const partner = { defaultFrames: ['f1', 'f1', 7], defaultLogos: [{ logoId: 'l1', scenario: 'a', order: 0 }, { logoId: 'l2' }], library: { frames: ['f9'] } };
  assert.deepEqual(partnerDefaultIds('frames', partner), ['f1']);
  assert.deepEqual(partnerDefaultIds('logos', partner), ['l1', 'l2']);
  assert.deepEqual(partnerSavedIds('frames', partner), ['f9']);
  assert.equal(partnerSavedIds('logos', partner), undefined, 'a kind that was not saved stays computed');
  assert.equal(partnerSavedIds('frames', {}), undefined);
});
