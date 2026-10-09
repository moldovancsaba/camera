import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lostItem, nextSnapshots, snapshotItem } from './snapshot';

const T1 = '2026-10-09T10:00:00.000Z';
const T2 = '2026-10-10T10:00:00.000Z';
const doc = (name: string, extra: Record<string, unknown> = {}) => ({ name, imageUrl: `https://img.example/${name}.png`, thumbnailUrl: `https://img.example/${name}-t.png`, mimeType: 'image/png', width: 10, height: 5, ...extra });
const docs = (entries: Record<string, Record<string, unknown>>) => new Map(Object.entries(entries));

test('a snapshot item is the small read-only record of a library item', () => {
  assert.deepEqual(snapshotItem('l1', doc('Roma', { source: 'messmass', scope: 'partner' }), T1), {
    id: 'l1', name: 'Roma', imageUrl: 'https://img.example/Roma.png', thumbnailUrl: 'https://img.example/Roma-t.png', mimeType: 'image/png', width: 10, height: 5, source: 'messmass', scope: 'partner', takenAt: T1,
  });
  assert.equal(snapshotItem('l2', {}, T1).scope, 'global', 'a missing scope is global');
  assert.equal('source' in snapshotItem('l2', {}, T1), false);
});

test('the first look takes a snapshot of every item in use, per place, in the order they are used', () => {
  const { snapshots, changed } = nextSnapshots(undefined, { 'logo-pages': ['a', 'b'], 'logo-capture-loading': ['a'] }, docs({ a: doc('A'), b: doc('B') }), T1);
  assert.equal(changed, true);
  assert.deepEqual(snapshots['logo-pages'].map((item) => item.id), ['a', 'b']);
  assert.deepEqual(snapshots['logo-capture-loading'].map((item) => item.id), ['a']);
});

test('looking again when nothing changed is not a change, and keeps the time the item was first taken: a page view does not write', () => {
  const first = nextSnapshots(undefined, { p: ['a'] }, docs({ a: doc('A') }), T1);
  const again = nextSnapshots(first.snapshots, { p: ['a'] }, docs({ a: doc('A') }), T2);
  assert.equal(again.changed, false);
  assert.equal(again.snapshots.p[0].takenAt, T1);
});

test('an item that changed in the library is a change and the snapshot follows it', () => {
  const first = nextSnapshots(undefined, { p: ['a'] }, docs({ a: doc('A') }), T1);
  const renamed = nextSnapshots(first.snapshots, { p: ['a'] }, docs({ a: doc('A2') }), T2);
  assert.equal(renamed.changed, true);
  assert.equal(renamed.snapshots.p[0].name, 'A2');
  assert.equal(renamed.snapshots.p[0].takenAt, T2);
});

test('THE FAIL-SAFE: an item the library no longer has but that still resolves keeps its last snapshot, and that is not a change', () => {
  const first = nextSnapshots(undefined, { p: ['a', 'gone'] }, docs({ a: doc('A'), gone: doc('Lost') }), T1);
  const after = nextSnapshots(first.snapshots, { p: ['a', 'gone'] }, docs({ a: doc('A') }), T2);
  assert.equal(after.changed, false);
  assert.deepEqual(after.snapshots.p.map((item) => item.name), ['A', 'Lost'], 'the lost item is still known, as it was');
  assert.equal(after.snapshots.p[1].takenAt, T1, 'with the time it was last seen');
});

test('an item with no item in the library and no earlier snapshot is simply not there (nothing to keep)', () => {
  const { snapshots } = nextSnapshots(undefined, { p: ['never-seen'] }, docs({}), T1);
  assert.deepEqual(snapshots.p, []);
});

test('an item that is no longer used is dropped from the snapshot, and so is a place that is no longer resolved', () => {
  const first = nextSnapshots(undefined, { p: ['a', 'b'], q: ['a'] }, docs({ a: doc('A'), b: doc('B') }), T1);
  const after = nextSnapshots(first.snapshots, { p: ['a'] }, docs({ a: doc('A'), b: doc('B') }), T2);
  assert.equal(after.changed, true);
  assert.deepEqual(after.snapshots, { p: [first.snapshots.p[0]] });
});

test('the lost item is found by id in the place, or in any other place of the event', () => {
  const { snapshots } = nextSnapshots(undefined, { p: ['a'], q: ['b'] }, docs({ a: doc('A'), b: doc('B') }), T1);
  assert.equal(lostItem(snapshots, 'p', 'a')?.name, 'A');
  assert.equal(lostItem(snapshots, 'p', 'b')?.name, 'B', 'kept in another place');
  assert.equal(lostItem(snapshots, 'p', 'zzz'), null);
  assert.equal(lostItem(undefined, 'p', 'a'), null);
});

test('the previous snapshots are not changed by building the next ones', () => {
  const first = nextSnapshots(undefined, { p: ['a'] }, docs({ a: doc('A') }), T1).snapshots;
  const copy = structuredClone(first);
  nextSnapshots(first, { p: ['a'] }, docs({ a: doc('A2') }), T2);
  assert.deepEqual(first, copy);
});
