import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ownerMediaUseMongoFilter } from '@/lib/events/consent-eligibility';
import { eventAsksForGalleryPermission } from './gallery-asked';
import { buildPublishSelfiesFilter, eventMatchFor } from './publishSelfies';
import { buildWallFilter } from './wall';

const KEYS = ['evt-uuid-1', '650000000000000000000001'];
const MARKER = { 'publicGalleryConsent.version': 1 };
function hasMarker(value: unknown): boolean {
  if (JSON.stringify(value) === JSON.stringify(MARKER)) return true;
  if (Array.isArray(value)) return value.some(hasMarker);
  if (value && typeof value === 'object') return Object.values(value).some(hasMarker);
  return false;
}

test('an event that does not ask: the wall and the bulk publish are exactly what they were', () => {
  assert.deepEqual(buildWallFilter(KEYS, false), buildWallFilter(KEYS));
  assert.deepEqual(buildPublishSelfiesFilter(KEYS, false), buildPublishSelfiesFilter(KEYS));
  assert.equal(hasMarker(buildWallFilter(KEYS)), false);
  assert.equal(hasMarker(buildPublishSelfiesFilter(KEYS)), false);
});

test('an event that asks: the wall accepts the ticked-box marker or explicit event-owner grant, still event-scoped', () => {
  const clauses = buildWallFilter(KEYS, true).$and as Record<string, unknown>[];
  assert.deepEqual(clauses[0], eventMatchFor(KEYS));
  assert.deepEqual(clauses.find((c) => 'isShareVisible' in c), { isShareVisible: true });
  assert.deepEqual(clauses[4], {
    $or: [MARKER, ownerMediaUseMongoFilter('public_gallery', KEYS)],
  });
  assert.ok(hasMarker(buildWallFilter(KEYS, true)));
});

test('an event that asks: the bulk publish only takes photos with the marker, and still only unset flags', () => {
  const filter = buildPublishSelfiesFilter(KEYS, true);
  const clauses = filter.$and as Record<string, unknown>[];
  assert.deepEqual(Object.keys(filter), ['$and']);
  assert.deepEqual(clauses[0], eventMatchFor(KEYS));
  assert.deepEqual(clauses.find((c) => 'isShareVisible' in c), { isShareVisible: null });
  assert.ok(hasMarker(filter));
});

const dbWithPartner = (partner: unknown): Db => ({ collection: () => ({ findOne: async () => partner }) }) as unknown as Db;
const dbThatMustNotBeAsked = (): Db => ({ collection: () => { throw new Error('the partner must not be read'); } }) as unknown as Db;

test('the setting: the event decides when it has a choice, else its partner, else not asked', async () => {
  assert.equal(await eventAsksForGalleryPermission(dbThatMustNotBeAsked(), null), false);
  assert.equal(await eventAsksForGalleryPermission(dbThatMustNotBeAsked(), { galleryConsent: true, partnerId: 'p1' }), true);
  assert.equal(await eventAsksForGalleryPermission(dbWithPartner({ galleryConsent: true }), { galleryConsent: false, partnerId: 'p1' }), false);
  assert.equal(await eventAsksForGalleryPermission(dbWithPartner({ galleryConsent: true }), { partnerId: 'p1' }), true);
  assert.equal(await eventAsksForGalleryPermission(dbWithPartner({}), { partnerId: 'p1' }), false);
  assert.equal(await eventAsksForGalleryPermission(dbWithPartner(null), { partnerId: 'p1' }), false);
  assert.equal(await eventAsksForGalleryPermission(dbThatMustNotBeAsked(), {}), false);
});
