import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS, defaultPhotoVetting, normalizePhotoVettingInput, photoVettingRequired } from './photo-vetting';

test('only an explicit true requires vetting; events made before the setting existed do not', () => {
  assert.equal(photoVettingRequired({ photoVetting: { required: true } }), true);
  assert.equal(photoVettingRequired({ photoVetting: { required: false } }), false);
  assert.equal(photoVettingRequired({ photoVetting: {} }), false);
  assert.equal(photoVettingRequired({ photoVetting: { required: 'true' } }), false);
  assert.equal(photoVettingRequired({}), false);
  assert.equal(photoVettingRequired(null), false);
  assert.equal(photoVettingRequired(undefined), false);
});

test('a new event starts with the default of the rollout (off until the rollout switches it on)', () => {
  assert.equal(defaultPhotoVetting('2026-10-06T00:00:00.000Z').required, PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS);
  assert.equal(PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS, false, 'merged packages change nothing until the rollout (the rollout package)');
});

test('a PATCH may set a boolean required and nothing else', () => {
  assert.deepEqual(normalizePhotoVettingInput({ required: true }, 'a@b.c', 'T'), { required: true, updatedAt: 'T', updatedBy: 'a@b.c' });
  assert.deepEqual(normalizePhotoVettingInput({ required: false, extra: 1 }, null, 'T'), { required: false, updatedAt: 'T', updatedBy: null });
  assert.equal(normalizePhotoVettingInput({ required: 'yes' }, null), null);
  assert.equal(normalizePhotoVettingInput({}, null), null);
  assert.equal(normalizePhotoVettingInput('x', null), null);
  assert.equal(normalizePhotoVettingInput(null, null), null);
});
