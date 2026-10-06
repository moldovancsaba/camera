import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHiddenFromAllEvents, isPubliclyVisible, publiclyVisibleClauses, visibilityInputOf } from './visibility';

test('a plain photo is public unless it is pending or rejected; a missing status is public (legacy photos)', () => {
  assert.equal(isPubliclyVisible({ submissionKind: 'original' }), true);
  assert.equal(isPubliclyVisible({}), true, 'no kind and no status: saved before vetting existed');
  assert.equal(isPubliclyVisible({ submissionKind: 'original', reviewStatus: 'approved' }), true);
  assert.equal(isPubliclyVisible({ submissionKind: 'original', reviewStatus: null }), true);
  assert.equal(isPubliclyVisible({ submissionKind: 'original', reviewStatus: 'pending_review' }), false);
  assert.equal(isPubliclyVisible({ submissionKind: 'original', reviewStatus: 'rejected' }), false);
  assert.equal(isPubliclyVisible({ reviewStatus: 'pending_review' }), false, 'a photo without a kind is a plain photo');
});

test('a try-on result is public only when approved and not turned off for sharing', () => {
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result', reviewStatus: 'approved', isShareVisible: true }), true);
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result', reviewStatus: 'approved' }), true);
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result', reviewStatus: 'approved', isShareVisible: false }), false);
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result', reviewStatus: 'pending_review', isShareVisible: true }), false);
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result', reviewStatus: 'rejected' }), false);
  assert.equal(isPubliclyVisible({ submissionKind: 'tryon_result' }), false, 'a result nobody approved');
});

test('an archived photo is never public, whatever its review says', () => {
  assert.equal(isPubliclyVisible({ submissionKind: 'original', reviewStatus: 'approved', isArchived: true }), false);
  assert.equal(isPubliclyVisible({ isArchived: true }), false);
  assert.equal(isPubliclyVisible({ isArchived: false }), true);
});

test('a photo hidden from every event it belongs to is not public; hidden from only one of two is', () => {
  assert.equal(isPubliclyVisible({ eventId: 'e1', eventIds: ['e1'], hiddenFromEvents: ['e1'] }), false);
  assert.equal(isPubliclyVisible({ eventId: 'e1', eventIds: ['e1', 'e2'], hiddenFromEvents: ['e1'] }), true);
  assert.equal(isPubliclyVisible({ eventId: 'e1', eventIds: ['e1', 'e2'], hiddenFromEvents: ['e1', 'e2'] }), false);
  assert.equal(isPubliclyVisible({ eventIds: ['e1'], hiddenFromEvents: ['e1'] }), false, 'only the eventIds list is set');
  assert.equal(isPubliclyVisible({ hiddenFromEvents: ['e1'] }), true, 'a photo with no event cannot be hidden from one');
  assert.equal(isHiddenFromAllEvents({ eventId: 'e1', hiddenFromEvents: [] }), false);
});

test('no photo at all is not public', () => {
  assert.equal(isPubliclyVisible(null), false);
  assert.equal(isPubliclyVisible(undefined), false);
});

test('the query clauses express the same rule', () => {
  const clauses = publiclyVisibleClauses(['e1', 'u1']);
  assert.equal(clauses.length, 3);
  assert.deepEqual(clauses[0], { isArchived: { $ne: true } });
  assert.deepEqual(clauses[1], { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: ['e1', 'u1'] } }] });
  const review = clauses[2] as { $or: Array<{ $and: object[] }> };
  assert.deepEqual(review.$or[0].$and[1], { reviewStatus: { $nin: ['pending_review', 'rejected'] } });
  assert.deepEqual(review.$or[1].$and, [{ submissionKind: 'tryon_result' }, { reviewStatus: 'approved' }, { isShareVisible: { $ne: false } }]);
});

test('the rule reads a database document defensively: odd values never make a photo public by accident', () => {
  assert.equal(visibilityInputOf(null), null);
  assert.equal(isPubliclyVisible(visibilityInputOf({ _id: 'x', submissionKind: 'tryon_result', reviewStatus: 'approved', isShareVisible: true })), true);
  assert.equal(isPubliclyVisible(visibilityInputOf({ reviewStatus: 'pending_review' })), false);
  assert.equal(isPubliclyVisible(visibilityInputOf({ isArchived: 'yes' })), true, 'only a real true archives');
  assert.equal(isPubliclyVisible(visibilityInputOf({ eventId: 'e1', hiddenFromEvents: ['e1', 7] })), false);
  assert.equal(isPubliclyVisible(visibilityInputOf({ submissionKind: 'tryon_result', reviewStatus: 'approved', isShareVisible: 'false' })), true, 'a non-boolean flag is not "off"');
});
