import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxBetween, boxesTouch, dragSelection, extendSelection, idsInBox, rangeIds, toggleId } from './selection';

const order = ['a', 'b', 'c', 'd', 'e', 'f'];

test('the range runs from the anchor to the target, both included, in either direction', () => {
  assert.deepEqual(rangeIds(order, 'b', 'e'), ['b', 'c', 'd', 'e']);
  assert.deepEqual(rangeIds(order, 'e', 'b'), ['b', 'c', 'd', 'e']);
  assert.deepEqual(rangeIds(order, 'c', 'c'), ['c']);
});

test('without an anchor, or when the anchor is gone, the range is the target alone; an unknown target is nothing', () => {
  assert.deepEqual(rangeIds(order, null, 'd'), ['d']);
  assert.deepEqual(rangeIds(order, 'zzz', 'd'), ['d']);
  assert.deepEqual(rangeIds(order, 'a', 'zzz'), []);
});

test('Shift+click after checking the anchor selects the whole range and keeps what was selected elsewhere', () => {
  assert.deepEqual(extendSelection(['a', 'f'], order, 'b', 'd', true), ['a', 'b', 'c', 'd', 'f']);
  assert.deepEqual(extendSelection(['b'], order, 'b', 'b', true), ['b']);
});

test('Shift+click after unchecking the anchor takes the whole range out', () => {
  assert.deepEqual(extendSelection(['a', 'b', 'c', 'd', 'e'], order, 'b', 'd', false), ['a', 'e']);
});

test('a photo no longer shown stays selected through a range', () => {
  assert.deepEqual(extendSelection(['gone'], order, 'a', 'b', true), ['a', 'b', 'gone']);
});

test('toggling adds and removes one id', () => {
  assert.deepEqual(toggleId(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b']);
});

test('boxes touch when they overlap, not when they only share an edge, whichever way the box was dragged', () => {
  const card = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.equal(boxesTouch(card, boxBetween({ x: 150, y: 150 }, { x: 300, y: 300 })), true);
  assert.equal(boxesTouch(card, boxBetween({ x: 150, y: 150 }, { x: 20, y: 20 })), true);
  assert.equal(boxesTouch(card, boxBetween({ x: 200, y: 100 }, { x: 300, y: 200 })), false);
  assert.equal(boxesTouch(card, boxBetween({ x: 0, y: 0 }, { x: 99, y: 400 })), false);
});

test('the dragged box selects the cards it touches; with Shift or Ctrl/Cmd the earlier selection stays', () => {
  const cards = [
    { id: 'a', box: { left: 0, top: 0, right: 100, bottom: 100 } },
    { id: 'b', box: { left: 120, top: 0, right: 220, bottom: 100 } },
    { id: 'c', box: { left: 0, top: 120, right: 100, bottom: 220 } },
  ];
  const touched = idsInBox(cards, boxBetween({ x: 50, y: 50 }, { x: 150, y: 80 }));
  assert.deepEqual(touched, ['a', 'b']);
  assert.deepEqual(dragSelection(['c'], touched, false), ['a', 'b']);
  assert.deepEqual(dragSelection(['c', 'a'], touched, true), ['c', 'a', 'b']);
});
