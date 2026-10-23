import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden } from '@/lib/api';
import { createPrivacyEraseHandler, type PrivacyEraseDependencies } from '@/app/api/internal/privacy/erase/route';
import { decryptMediaReferences, encryptMediaReferences, minimalErasedSubmission, PRIVACY_ERASURE_ACTIVE_FILTER } from './erasure';

const requestId = 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab';
const photoId = new ObjectId('507f1f77bcf86cd799439011');
const participantProof = { version: 1 as const, caseId: requestId, subject: { kind: 'camera_photo' as const, id: 'submission-opaque-1' } };

function post(body: unknown) {
  return new NextRequest('http://localhost/api/internal/privacy/erase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('media reference envelope is encrypted and authenticated', () => {
  const url = 'https://i.ibb.co/private-person.jpg';
  const legacyPhotoUrl = 'https://blob.vercel-storage.com/private-review.jpg';
  const envelope = encryptMediaReferences({ imageUrl: url, userEmail: 'private@example.com', photoReview: { photoUrl: legacyPhotoUrl, reviewerNote: 'must not retain' } }, 'resolver-secret');
  assert.ok(envelope);
  assert.equal(JSON.stringify(envelope).includes(url), false);
  assert.equal(JSON.stringify(envelope).includes(legacyPhotoUrl), false);
  assert.deepEqual(decryptMediaReferences(envelope, 'resolver-secret'), { imageUrl: url, legacyPhotoReviewUrl: legacyPhotoUrl });
  const changedCiphertext = `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`;
  assert.throws(() => decryptMediaReferences({ ...envelope, ciphertext: changedCiphertext }, 'resolver-secret'));
  assert.throws(() => decryptMediaReferences(envelope, 'rotated-secret'));
});

test('encrypted media handoff keeps only URLs and safe image-copy delete handles', () => {
  const envelope = encryptMediaReferences({
    imageUrl: 'https://blob.example/photo.jpg',
    screenImageBytes: 123456,
    userEmail: 'private@example.com',
    reviewNotes: 'do not retain',
    fanmassAnalysisReview: { note: 'do not retain' },
    imageCopies: [{ role: 'composed', store: 'imgbb', state: 'verified', url: 'https://i.ibb.co/a/b.jpg', deleteUrl: 'https://ibb.co/delete/token', fileSize: 12, reviewer: 'private@example.com' }],
  }, 'test-media-key-that-is-at-least-32-bytes-long');
  assert.ok(envelope);
  const clear = decryptMediaReferences(envelope, 'test-media-key-that-is-at-least-32-bytes-long');
  assert.equal('screenImageBytes' in clear, false);
  assert.equal('userEmail' in clear, false);
  assert.equal('reviewNotes' in clear, false);
  assert.equal('fanmassAnalysisReview' in clear, false);
  assert.deepEqual(clear.imageCopies, [{ role: 'composed', store: 'imgbb', state: 'verified', url: 'https://i.ibb.co/a/b.jpg', deleteUrl: 'https://ibb.co/delete/token' }]);
});

test('minimal erased source row contains only the immutable photo key and retry fence', () => {
  const row = minimalErasedSubmission({ photoId, requestId, fencedAt: '2026-10-23T12:00:00.000Z', recordErasedAt: '2026-10-23T12:02:00.000Z' });
  assert.deepEqual(Object.keys(row).sort(), ['_id', 'privacyErasure']);
  assert.deepEqual(row.privacyErasure, {
    state: 'record_erased', requestId, fencedAt: '2026-10-23T12:00:00.000Z', recordErasedAt: '2026-10-23T12:02:00.000Z',
  });
  assert.equal(PRIVACY_ERASURE_ACTIVE_FILTER['privacyErasure.state'].$nin.includes('fenced'), true);
});

test('exact SSO photo reference fences once, stores no plaintext media link, and retries idempotently', async () => {
  const photoUrl = 'https://i.ibb.co/private-person.jpg';
  const db = fakeDb({
    [COLLECTIONS.SUBMISSIONS]: [{ _id: photoId, submissionId: 'submission-opaque-1', eventId: 'event-1', userInfo: { email: 'person@example.com' }, imageUrl: photoUrl, photoReview: { photoUrl: 'https://blob.vercel-storage.com/private.jpg' } }],
  });
  const deps: PrivacyEraseDependencies = {
    authenticate: () => 'test-resolver-secret',
    mediaKey: () => 'test-media-key-that-is-at-least-32-bytes-long',
    rateLimit: async () => undefined,
    getProof: async () => participantProof,
    connectDatabase: async () => db.db,
    now: () => '2026-10-23T12:00:00.000Z',
  };
  const erase = createPrivacyEraseHandler(deps);
  const body = { request_id: requestId, photos: [{ photo_id: photoId.toHexString(), submission_id: 'submission-opaque-1', event_id: 'event-1' }] };
  const first = await erase(post(body));
  const firstJson = await first.json() as { data: { status: string; photos: Array<{ status: string }> } };
  assert.equal(firstJson.data.status, 'accepted');
  assert.equal(firstJson.data.photos[0].status, 'fenced');
  const source = db.data[COLLECTIONS.SUBMISSIONS][0];
  assert.equal((source.privacyErasure as Record<string, unknown>).state, 'fenced');
  assert.equal(source.isShareVisible, false);
  const receipt = db.data[COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES][0];
  assert.ok(receipt);
  assert.equal(JSON.stringify(receipt).includes(photoUrl), false);
  assert.equal(JSON.stringify(receipt).includes('person@example.com'), false);
  const second = await erase(post(body));
  const secondJson = await second.json() as { data: { photos: Array<{ status: string }> } };
  assert.equal(secondJson.data.photos[0].status, 'fenced');
  assert.equal(db.data[COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES].length, 1);
});

test('unmatched exact reference does not fence another photo; caller auth is mandatory', async () => {
  const db = fakeDb({ [COLLECTIONS.SUBMISSIONS]: [{ _id: photoId, submissionId: 'different-submission', eventId: 'event-1', imageUrl: 'https://i.ibb.co/photo.jpg' }] });
  const deps: PrivacyEraseDependencies = {
    authenticate: () => 'test-resolver-secret', mediaKey: () => 'test-media-key-that-is-at-least-32-bytes-long', rateLimit: async () => undefined, getProof: async () => participantProof,
    connectDatabase: async () => db.db, now: () => '2026-10-23T12:00:00.000Z',
  };
  const erase = createPrivacyEraseHandler(deps);
  const result = await erase(post({ request_id: requestId, photos: [{ photo_id: photoId.toHexString(), submission_id: 'different-submission' }] }));
  const json = await result.json() as { data: { photos: Array<{ status: string }> } };
  assert.equal(json.data.photos[0].status, 'not_found');
  assert.equal(db.data[COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES]?.length ?? 0, 0);
  assert.equal(db.data[COLLECTIONS.SUBMISSIONS][0].privacyErasure, undefined);

  const unauthorized = createPrivacyEraseHandler({ ...deps, authenticate: () => { throw apiForbidden(); } });
  await assert.rejects(() => unauthorized(post({ request_id: requestId, photos: [{ photo_id: photoId.toHexString(), submission_id: 'different-submission' }] })), (error: unknown) => error instanceof Response && error.status === 403);
});
