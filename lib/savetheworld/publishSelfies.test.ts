import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEventSubmissionsFilter,
  buildPublishSelfiesFilter,
  eventMatchFor,
} from './publishSelfies';

const KEYS = ['evt-uuid-1', '650000000000000000000001'];

test('publish filter keeps the event scope next to the image-URL $or', () => {
  const filter = buildPublishSelfiesFilter(KEYS);
  // Regression: a top-level $or here once overwrote the event $or and the
  // update ran across every event in the collection.
  assert.deepEqual(Object.keys(filter), ['$and']);
  const clauses = filter.$and as Record<string, unknown>[];
  assert.deepEqual(clauses[0], eventMatchFor(KEYS));
  assert.ok(
    clauses.some((c) => Array.isArray(c.$or) && JSON.stringify(c.$or).includes('finalImageUrl')),
    'image-URL clause present',
  );
  assert.ok(clauses.some((c) => 'isShareVisible' in c), 'isShareVisible clause present');
});

test('total filter is scoped to the same event', () => {
  const filter = buildEventSubmissionsFilter(KEYS);
  assert.deepEqual(Object.keys(filter), ['$and']);
  assert.deepEqual((filter.$and as unknown[])[0], eventMatchFor(KEYS));
});

test('refuses to build an unscoped filter', () => {
  assert.throws(() => buildPublishSelfiesFilter([]), /unscoped/);
});
