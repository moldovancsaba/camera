import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhotoModerationPrecheckInput, photoModerationPrecheckEnabled } from './photo-moderation';

test('content precheck is disabled unless an event explicitly enables it', () => {
  assert.equal(photoModerationPrecheckEnabled(undefined), false);
  assert.equal(photoModerationPrecheckEnabled({ photoModerationPrecheck: { enabled: false } }), false);
  assert.equal(photoModerationPrecheckEnabled({ photoModerationPrecheck: { enabled: true } }), true);
});

test('event setting accepts only a boolean enabled value and records who changed it', () => {
  assert.equal(normalizePhotoModerationPrecheckInput({ enabled: 'true' }, 'admin@example.com'), null);
  assert.deepEqual(
    normalizePhotoModerationPrecheckInput({ enabled: true }, 'admin@example.com', '2026-10-27T10:00:00.000Z'),
    { enabled: true, updatedAt: '2026-10-27T10:00:00.000Z', updatedBy: 'admin@example.com' },
  );
});
