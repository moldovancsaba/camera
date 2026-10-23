import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRestoreReplayReadiness, parseBackupErasureTombstone, validateTombstoneFeed } from './restore-replay-contract';

const requestId = '0e5c7a31-166d-4125-9b17-34f5704c2f3a';
const photoId = '507f1f77bcf86cd799439011';

test('restore readiness is closed in production and against the primary/non-restore database', () => {
  const isolated = { CAMERA_PRIVACY_RESTORE_MODE: 'isolated', CAMERA_PRIVACY_RESTORE_DATABASE_NAME: 'camera_restore_20261023', CAMERA_PRIVACY_RESTORE_INSTANCE_ID: 'restore-run-20261023', MONGODB_DB: 'camera_restore_20261023', VERCEL_ENV: 'preview' };
  assert.deepEqual(buildRestoreReplayReadiness(isolated), { mode: 'isolated', databaseName: 'camera_restore_20261023', instanceId: 'restore-run-20261023' });
  assert.equal(buildRestoreReplayReadiness({ ...isolated, VERCEL_ENV: 'production' }), null);
  assert.equal(buildRestoreReplayReadiness({ ...isolated, MONGODB_DB: 'camera' }), null);
  assert.equal(buildRestoreReplayReadiness({ ...isolated, CAMERA_PRIVACY_RESTORE_MODE: 'disabled' }), null);
  assert.equal(buildRestoreReplayReadiness({ ...isolated, CAMERA_PRIVACY_RESTORE_INSTANCE_ID: 'x' }), null);
  assert.equal(buildRestoreReplayReadiness({ ...isolated, VERCEL_ENV: undefined }), null);
});

test('tombstone parser normalizes only exact opaque product references', () => {
  assert.deepEqual(parseBackupErasureTombstone({ requestId: requestId.toUpperCase(), photoId: photoId.toUpperCase(), submissionId: ' submission-1 ', eventIds: ['event-b', 'event-a', 'event-a'], partnerId: 'partner-1' }), {
    requestId, photoId, submissionId: 'submission-1', eventIds: ['event-a', 'event-b'], partnerId: 'partner-1',
  });
  assert.throws(() => parseBackupErasureTombstone({ requestId, photoId, submissionId: 'submission-1', eventIds: [], partnerId: null, email: 'person@example.com' }), /invalid_tombstone/);
  assert.throws(() => parseBackupErasureTombstone({ requestId, photoId, submissionId: 'submission-1', eventIds: [], partnerId: null, mediaUrl: 'https://example.com/photo.jpg' }), /invalid_tombstone/);
});

test('restore feed requires a configured finite backup retention policy and stable paging contract', () => {
  const row = { requestId, photoId, submissionId: 'submission-1', eventIds: ['event-1'], partnerId: 'partner-1' };
  assert.deepEqual(validateTombstoneFeed({ version: 1, retentionPolicy: { configured: true, days: 90 }, tombstones: [row], complete: false, nextCursor: 'opaque' }), {
    tombstones: [row], complete: false, nextCursor: 'opaque',
  });
  assert.throws(() => validateTombstoneFeed({ version: 1, retentionPolicy: { configured: false, days: null }, tombstones: [], complete: true, nextCursor: null }), /backup_retention_policy_unconfigured/);
  assert.throws(() => validateTombstoneFeed({ version: 1, retentionPolicy: { configured: true, days: 90 }, tombstones: [], complete: false, nextCursor: null }), /invalid_tombstone_feed/);
});
