import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookUp, pickRandom, resolveSlot, slotMode } from './resolve';

const ids = (chain: Parameters<typeof resolveSlot>[0]) => resolveSlot(chain).items.map((item) => `${item.level}:${item.id}`);

test('nothing stored at a level: it uses the default, the items of the level above', () => {
  const chain = [
    { level: 'global', value: { items: ['g1'] } },
    { level: 'partner', value: undefined },
    { level: 'event', value: null },
  ];
  assert.deepEqual(ids(chain), ['global:g1']);
  const resolved = resolveSlot(chain);
  assert.equal(resolved.mode, 'default');
  assert.equal(resolved.source, 'inherited');
});

test('add more: the own items come first, the default stays next to them', () => {
  const resolved = resolveSlot([
    { level: 'partner', value: { items: ['messmass'] } },
    { level: 'event', value: { items: ['own1', 'own2'] } },
  ]);
  assert.deepEqual(resolved.items.map((i) => i.id), ['own1', 'own2', 'messmass']);
  assert.equal(resolved.mode, 'add');
  assert.equal(resolved.source, 'both');
});

test('replace: the default is not used, only the own items', () => {
  const resolved = resolveSlot([
    { level: 'partner', value: { items: ['messmass'] } },
    { level: 'event', value: { items: ['own'], useDefault: false } },
  ]);
  assert.deepEqual(resolved.items, [{ id: 'own', level: 'event' }]);
  assert.equal(resolved.mode, 'replace');
  assert.equal(resolved.source, 'own');
});

test('none: no own items and the default switched off means nothing is used here', () => {
  const resolved = resolveSlot([
    { level: 'partner', value: { items: ['messmass'] } },
    { level: 'event', value: { useDefault: false } },
  ]);
  assert.deepEqual(resolved.items, []);
  assert.equal(resolved.mode, 'none');
  assert.equal(resolved.source, 'none');
});

test('a level between takes part: the event follows what the partner chose, replace included', () => {
  const chain = [
    { level: 'global', value: { items: ['g1'] } },
    { level: 'partner', value: { items: ['p1'], useDefault: false } },
    { level: 'event', value: undefined },
  ];
  assert.deepEqual(ids(chain), ['partner:p1'], 'the partner replaced the global default; the event uses the partner');
});

test('a change at the parent shows at once: the child stores nothing, so there is no copy to go stale', () => {
  const child = { level: 'event', value: undefined };
  assert.deepEqual(ids([{ level: 'partner', value: { items: ['old'] } }, child]), ['partner:old']);
  assert.deepEqual(ids([{ level: 'partner', value: { items: ['new'] } }, child]), ['partner:new']);
});

test('an item held by two levels is used once and belongs to the closest level; empty and repeated ids are ignored', () => {
  const resolved = resolveSlot([
    { level: 'partner', value: { items: ['a', 'b'] } },
    { level: 'event', value: { items: ['b', '', 'b', 'c'] } },
  ]);
  assert.deepEqual(resolved.items, [
    { id: 'b', level: 'event' },
    { id: 'c', level: 'event' },
    { id: 'a', level: 'partner' },
  ]);
});

test('a place under the event takes the event as its default', () => {
  const event = { level: 'event', value: { items: ['e1'] } };
  assert.deepEqual(ids([{ level: 'partner', value: { items: ['p1'] } }, event, { level: 'loading', value: undefined }]), ['event:e1', 'partner:p1']);
  assert.deepEqual(ids([{ level: 'partner', value: { items: ['p1'] } }, event, { level: 'loading', value: { items: ['x'], useDefault: false } }]), ['loading:x']);
});

test('the mode of a value, whatever the level', () => {
  assert.equal(slotMode(undefined), 'default');
  assert.equal(slotMode({}), 'default');
  assert.equal(slotMode({ items: [] }), 'default');
  assert.equal(slotMode({ items: ['a'] }), 'add');
  assert.equal(slotMode({ items: ['a'], useDefault: true }), 'add');
  assert.equal(slotMode({ items: ['a'], useDefault: false }), 'replace');
  assert.equal(slotMode({ useDefault: false }), 'none');
});

test('an empty chain uses nothing', () => {
  assert.deepEqual(resolveSlot([]), { items: [], mode: 'default', source: 'none' });
});

test('one item is used as it is; several are picked at random, every one of them reachable', () => {
  assert.equal(pickRandom([]), null);
  assert.equal(pickRandom(['only'], () => 0.99), 'only');
  const three = ['a', 'b', 'c'];
  assert.equal(pickRandom(three, () => 0), 'a');
  assert.equal(pickRandom(three, () => 0.5), 'b');
  assert.equal(pickRandom(three, () => 0.999999), 'c');
  assert.equal(pickRandom(three, () => 1), 'c', 'a random of exactly 1 stays inside the list');
});

test('the chain is not changed by resolving it', () => {
  const chain = [{ level: 'partner', value: { items: ['p'] } }, { level: 'event', value: { items: ['e'] } }];
  const copy = structuredClone(chain);
  resolveSlot(chain);
  assert.deepEqual(chain, copy);
});

test('an id the library no longer has stays in the list, marked missing, instead of disappearing (the hook of the fail-safe gate)', () => {
  const resolved = resolveSlot([{ level: 'partner', value: { items: ['kept', 'gone'] } }, { level: 'event', value: undefined }]);
  const library = new Map([['kept', { name: 'Kept logo' }]]);
  assert.deepEqual(lookUp(resolved, (id) => library.get(id)), [
    { id: 'kept', level: 'partner', item: { name: 'Kept logo' }, missing: false },
    { id: 'gone', level: 'partner', item: null, missing: true },
  ]);
});


test('one draw per visit gives the same logo in every place that has the same list, and every logo is reachable across visits', () => {
  const list = ['a', 'b', 'c'];
  for (const draw of [0, 0.2, 0.5, 0.99]) {
    assert.equal(pickRandom(list, () => draw), pickRandom([...list], () => draw), 'two places, same list, same draw: the same logo');
  }
  const seen = new Set([0.05, 0.4, 0.9].map((draw) => pickRandom(list, () => draw)));
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
});
