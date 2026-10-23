import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectMediaReferences, createMediaDeleteTasks, deleteAndVerifyMediaReference } from './media-erasure';

const TOKEN = 'vercel_blob_rw_Store123_secret';
const BLOB = 'https://store123.public.blob.vercel-storage.com/event/photo.jpg';
const IMG = 'https://i.ibb.co/AbC123/framed.jpg';
const DELETE = 'https://ibb.co/delete/opaque';

test('media handoff references deduplicate variants and keep unsupported references visible without contacting them', () => {
  const references = collectMediaReferences({
    imageUrl: BLOB,
    finalImageUrl: BLOB,
    photoReview: undefined,
    legacyPhotoReviewUrl: BLOB,
    deleteUrl: DELETE,
    imageCopies: [
      { role: 'composed', store: 'imgbb', state: 'verified', url: IMG, deleteUrl: DELETE },
      { role: 'unframed', store: 'blob', state: 'deleted', url: 'https://store123.public.blob.vercel-storage.com/pending/gone.jpg' },
      { role: 'legacy', url: 'https://legacy.example/private.jpg' },
    ],
  }, TOKEN);
  assert.deepEqual(references.map((reference) => reference.provider), ['blob', 'imgbb', 'imgbb', 'unsupported']);
  assert.equal(references[0].url, BLOB);
  assert.deepEqual(references[0].variants.sort(), ['finalImageUrl', 'imageUrl', 'legacyPhotoReviewUrl']);
  const imgbbImage = references.find((reference) => reference.url === IMG);
  assert.equal(imgbbImage?.deleteUrl, DELETE);
  assert.equal(references.find((reference) => reference.url === null)?.provider, 'imgbb', 'an orphaned ImgBB delete handle is retained but cannot be falsely verified');
  assert.equal(references.some((reference) => reference.url?.endsWith('/gone.jpg')), false);
  assert.equal(references[3].provider, 'unsupported');
  assert.deepEqual(createMediaDeleteTasks(references, '2026-10-23T12:00:00.000Z').map((task) => task.taskId), ['media-0', 'media-1', 'media-2', 'media-3']);
});

test('a top-level ImgBB image and its delete handle form one deletable target', () => {
  const references = collectMediaReferences({ imageUrl: IMG, finalImageUrl: IMG, deleteUrl: DELETE });
  assert.equal(references.length, 1);
  assert.deepEqual(references[0], {
    refIndex: 0,
    provider: 'imgbb',
    url: IMG,
    deleteUrl: DELETE,
    variants: ['finalImageUrl', 'imageUrl'],
  });
});

test('Blob deletion is complete only after a follow-up head proves absence', async () => {
  let deleted = false;
  const outcome = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'blob', url: BLOB, deleteUrl: null, variants: ['imageUrl'] }, {
    blobToken: TOKEN,
    deleteBlob: (async () => { deleted = true; }) as never,
    headBlob: (async () => {
      assert.equal(deleted, true);
      const error = new Error('missing') as Error & { name: string };
      error.name = 'BlobNotFoundError';
      throw error;
    }) as never,
    checkBlobPublic: async () => 'absent',
  });
  assert.deepEqual(outcome, { state: 'deleted' });
});

test('Blob provider errors and a still-present object remain retryable', async () => {
  const outcome = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'blob', url: BLOB, deleteUrl: null, variants: ['imageUrl'] }, {
    blobToken: TOKEN,
    deleteBlob: async () => undefined as never,
    headBlob: async () => ({ size: 1, contentType: 'image/jpeg', url: BLOB, pathname: 'photo.jpg', uploadedAt: new Date(), contentDisposition: 'inline', cacheControl: '', etag: 'x' }) as never,
  });
  assert.deepEqual(outcome, { state: 'retry', errorCode: 'blob_still_present' });

  const unknownStore = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'blob', url: BLOB, deleteUrl: null, variants: ['imageUrl'] }, { blobToken: 'vercel_blob_rw_other_secret' });
  assert.deepEqual(unknownStore, { state: 'unknown', errorCode: 'blob_credentials_or_store_unavailable' });
});

test('ImgBB is verified before and after a strict-host deletion request', async () => {
  const checks = ['ok', 'broken'];
  let requested = '';
  const outcome = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'imgbb', url: IMG, deleteUrl: DELETE, variants: ['composed'] }, {
    checkPicture: async () => checks.shift() as 'ok' | 'broken',
    deleteImgBb: async (deleteUrl) => { requested = deleteUrl; return 302; },
  });
  assert.equal(requested, DELETE);
  assert.deepEqual(outcome, { state: 'deleted' });

  const absent = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'imgbb', url: IMG, deleteUrl: DELETE, variants: ['composed'] }, {
    checkPicture: async () => 'broken',
    deleteImgBb: async () => { throw new Error('must not delete an already absent object'); },
  });
  assert.deepEqual(absent, { state: 'already_absent' });
});

test('untrusted ImgBB delete hosts and orphaned handles never report verified absence', async () => {
  const unsafe = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'imgbb', url: IMG, deleteUrl: 'https://ibb.co.attacker.example/delete', variants: ['composed'] }, {
    deleteImgBb: async () => { throw new Error('must not contact an untrusted host'); },
  });
  assert.deepEqual(unsafe, { state: 'unknown', errorCode: 'imgbb_delete_reference_unavailable' });

  const orphan = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'imgbb', url: null, deleteUrl: DELETE, variants: ['legacy'] }, {
    deleteImgBb: async () => 302,
  });
  assert.deepEqual(orphan, { state: 'unknown', errorCode: 'imgbb_orphan_delete_unverified' });
});

test('a public asset still referenced by another live photo remains unresolved and is not deleted', async () => {
  let deleteCalls = 0;
  const outcome = await deleteAndVerifyMediaReference({ refIndex: 0, provider: 'imgbb', url: IMG, deleteUrl: DELETE, variants: ['composed'] }, {
    isReferencedElsewhere: async () => true,
    deleteImgBb: async () => { deleteCalls += 1; return 200; },
  });
  assert.deepEqual(outcome, { state: 'retry', errorCode: 'media_reference_shared' });
  assert.equal(deleteCalls, 0);
});
