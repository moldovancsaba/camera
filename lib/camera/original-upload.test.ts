import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateOriginalPathname } from '@/lib/submissions/original-image';
import type { FullFrameCapture } from './frame-capture';
import { ORIGINAL_UPLOAD_RETRY_DELAYS_MS, uploadOriginal, type OriginalUploader } from './original-upload';

const EVENT = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const capture = { blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }), dataUrl: 'data:', width: 1440, height: 1920, facingMode: 'user', mirrored: true } as FullFrameCapture;
const noSleep = async () => {};

test('a successful upload returns the URL with the size of the image', async () => {
  const calls: Array<{ pathname: string; clientPayload: string; contentType: string; handleUploadUrl: string }> = [];
  const uploader: OriginalUploader = async (pathname, body, options) => {
    assert.equal(body, capture.blob);
    calls.push({ pathname, ...options });
    return { url: `https://store.example/${pathname}-abc` };
  };
  const result = await uploadOriginal(capture, EVENT, { uploader, sleep: noSleep });
  assert.ok(result);
  assert.equal(result.width, 1440);
  assert.equal(result.height, 1920);
  assert.equal(calls.length, 1);
  assert.equal(validateOriginalPathname(calls[0].pathname, EVENT), true, 'the path is inside originals/<event>/ and ends in .jpg');
  assert.equal(calls[0].handleUploadUrl, '/api/uploads/original');
  assert.equal(calls[0].contentType, 'image/jpeg');
  assert.deepEqual(JSON.parse(calls[0].clientPayload), { eventId: EVENT });
});

test('a failed attempt is retried after a pause and the later success is used', async () => {
  let attempts = 0;
  const pauses: number[] = [];
  const uploader: OriginalUploader = async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('network');
    return { url: 'https://store.example/ok' };
  };
  const result = await uploadOriginal(capture, EVENT, { uploader, sleep: async (ms) => { pauses.push(ms); } });
  assert.equal(result?.url, 'https://store.example/ok');
  assert.equal(attempts, 3);
  assert.deepEqual(pauses, ORIGINAL_UPLOAD_RETRY_DELAYS_MS);
});

test('when every attempt fails the result is null and nothing throws, so the save can go ahead without the original', async () => {
  let attempts = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await uploadOriginal(capture, EVENT, { uploader: async () => { attempts += 1; throw new Error('down'); }, sleep: noSleep });
    assert.equal(result, null);
    assert.equal(attempts, ORIGINAL_UPLOAD_RETRY_DELAYS_MS.length + 1);
  } finally {
    console.warn = originalWarn;
  }
});
