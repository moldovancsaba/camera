import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ORIGINAL_MAX_BYTES,
  blobStoreHostFromToken,
  isOriginalBlobUrl,
  isValidEventIdForPath,
  originalPathPrefix,
  validateOriginalPathname,
  verifyOriginalImage,
} from './original-image';

const EVENT = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const HOST = 'bidx0njghn1voknt.public.blob.vercel-storage.com';
const GOOD = `https://${HOST}/originals/${EVENT}/abc123-xyz.jpg`;

test('only event ids that are safe in a path are accepted', () => {
  assert.equal(isValidEventIdForPath(EVENT), true);
  for (const bad of ['', 'short', 'a/b/c/d/e/f/g/h', '../../etc/passwd', 'x'.repeat(65), 'has space here', null, 42]) {
    assert.equal(isValidEventIdForPath(bad), false, String(bad));
  }
});

test('an original pathname is originals/<event>/<one safe file>.jpg and nothing else', () => {
  assert.equal(originalPathPrefix(EVENT), `originals/${EVENT}/`);
  assert.equal(validateOriginalPathname(`originals/${EVENT}/photo-1.jpg`, EVENT), true);
  assert.equal(validateOriginalPathname(`originals/${EVENT}/Photo.JPEG`, EVENT), true);
  for (const bad of [
    `originals/${EVENT}/photo.png`,
    `originals/${EVENT}/sub/photo.jpg`,
    `originals/${EVENT}/../other/photo.jpg`,
    `originals/${EVENT}/..jpg`,
    `originals/${EVENT}/ph oto.jpg`,
    `originals/${EVENT}/`,
    `originals/other-event-id-0001/photo.jpg`,
    `frames/${EVENT}/photo.jpg`,
    `tryon/${EVENT}/photo.jpg`,
  ]) {
    assert.equal(validateOriginalPathname(bad, EVENT), false, bad);
  }
  assert.equal(validateOriginalPathname(`originals/${EVENT}/photo.jpg`, 'not valid'), false);
});

test('the store host comes from the read-write token and nothing else', () => {
  assert.equal(blobStoreHostFromToken('vercel_blob_rw_BIDX0njghn1voknt_secretvalue'), HOST);
  assert.equal(blobStoreHostFromToken('nonsense'), null);
  assert.equal(blobStoreHostFromToken(undefined), null);
});

test('only an https URL in our own store, inside the event folder, is an original', () => {
  const options = { eventId: EVENT, storeHost: HOST };
  assert.equal(isOriginalBlobUrl(GOOD, options), true);
  for (const bad of [
    `http://${HOST}/originals/${EVENT}/a.jpg`,
    `https://evil.example.com/originals/${EVENT}/a.jpg`,
    `https://other.public.blob.vercel-storage.com/originals/${EVENT}/a.jpg`,
    `https://${HOST}/originals/other-event-id-0001/a.jpg`,
    `https://${HOST}/originals/${EVENT}/a.jpg?download=1`,
    `https://${HOST}/originals/${EVENT}/a.jpg#x`,
    `https://user:pw@${HOST}/originals/${EVENT}/a.jpg`,
    `https://${HOST}/originals/${EVENT}/%2e%2e/a.jpg`,
    `https://${HOST}/originals/${EVENT}/a.png`,
    'not a url',
    '',
    null,
  ]) {
    assert.equal(isOriginalBlobUrl(bad, options), false, String(bad));
  }
  assert.equal(isOriginalBlobUrl(GOOD, { eventId: EVENT, storeHost: null }), false, 'no store host configured');
  assert.equal(isOriginalBlobUrl(GOOD, { eventId: 'bad id', storeHost: HOST }), false);
});

const jpeg = async () => ({ size: 3_400_000, contentType: 'image/jpeg' });

test('no claim means no original, and nothing is looked up', async () => {
  let called = false;
  for (const url of [undefined, null, '']) {
    const check = await verifyOriginalImage({ url, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => { called = true; return null; } });
    assert.deepEqual(check, { kind: 'none' });
  }
  assert.equal(called, false);
});

test('a confirmed original returns its verified size, type and clamped dimensions', async () => {
  const check = await verifyOriginalImage({ url: GOOD, width: 1440.4, height: 1920, eventId: EVENT, storeHost: HOST, head: jpeg });
  assert.deepEqual(check, { kind: 'ok', original: { url: GOOD, width: 1440, height: 1920, fileSize: 3_400_000, mimeType: 'image/jpeg' } });
  const odd = await verifyOriginalImage({ url: GOOD, width: -5, height: 99999, eventId: EVENT, storeHost: HOST, head: jpeg });
  assert.equal(odd.kind === 'ok' && odd.original.width, undefined);
  assert.equal(odd.kind === 'ok' && odd.original.height, undefined);
});

test('a claim outside our store or the event folder is invalid, without looking anything up', async () => {
  let called = false;
  const head = async () => { called = true; return null; };
  const foreign = await verifyOriginalImage({ url: `https://evil.example.com/originals/${EVENT}/a.jpg`, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head });
  assert.equal(foreign.kind, 'invalid');
  const otherEvent = await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: 'another-event-id-9999', storeHost: HOST, head });
  assert.equal(otherEvent.kind, 'invalid');
  assert.equal(called, false);
});

test('a file that is not a JPEG, or is empty or too large, is invalid', async () => {
  const wrongType = await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => ({ size: 1000, contentType: 'text/html' }) });
  assert.equal(wrongType.kind, 'invalid');
  const empty = await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => ({ size: 0, contentType: 'image/jpeg' }) });
  assert.equal(empty.kind, 'invalid');
  const huge = await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => ({ size: ORIGINAL_MAX_BYTES + 1, contentType: 'image/jpeg' }) });
  assert.equal(huge.kind, 'invalid');
});

test('a file that cannot be confirmed keeps the submission but not the original', async () => {
  assert.deepEqual(await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => null }), { kind: 'unverified' });
  assert.deepEqual(await verifyOriginalImage({ url: GOOD, width: 1, height: 1, eventId: EVENT, storeHost: HOST, head: async () => { throw new Error('network'); } }), { kind: 'unverified' });
});
