import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBoundedRequestJson, validImageDirectCallbackCredential, validateImageDirectCompletion } from './image-direct-callback';

const digest = 'a'.repeat(64);
const payload = {
  schemaVersion: 1,
  renderer: 'image_direct',
  jobId: 'job_camera_123',
  executionId: 'exec_image_direct_123',
  publicResultUrl: `https://images.example/assets/${'b'.repeat(24)}/versions/1/${digest}`,
  sha256: digest,
  byteLength: 4096,
  mediaType: 'image/png',
  workerId: 'worker-1',
  processorMeta: { pipelineVersion: 'pipeline-1.2.0', modelId: 'mlx-community/flux2-klein-4b-4bit' },
  idempotencyKey: 'image-direct-result:job_camera_123:v1',
};

test('image.direct callback accepts only an exact configured host and immutable digest URL', () => {
  assert.equal(validateImageDirectCompletion(payload, 'images.example').ok, true);
  assert.deepEqual(validateImageDirectCompletion(payload, 'other.example'), { ok: false, code: 'result_host_rejected' });
  assert.deepEqual(validateImageDirectCompletion({ ...payload, publicResultUrl: `${payload.publicResultUrl}?token=secret` }, 'images.example'), { ok: false, code: 'result_host_rejected' });
  assert.deepEqual(validateImageDirectCompletion({ ...payload, publicResultUrl: payload.publicResultUrl.replace(digest, 'c'.repeat(64)) }, 'images.example'), { ok: false, code: 'result_host_rejected' });
  assert.deepEqual(validateImageDirectCompletion({ ...payload, publicResultUrl: `https://user@images.example/assets/${'b'.repeat(24)}/versions/1/${digest}` }, 'images.example'), { ok: false, code: 'result_host_rejected' });
});

test('image.direct callback rejects malformed metadata, unknown fields, and missing host configuration', () => {
  assert.deepEqual(validateImageDirectCompletion({ ...payload, byteLength: 0 }, 'images.example'), { ok: false, code: 'invalid_callback' });
  assert.deepEqual(validateImageDirectCompletion({ ...payload, untrusted: true }, 'images.example'), { ok: false, code: 'invalid_callback' });
  assert.deepEqual(validateImageDirectCompletion(payload, ''), { ok: false, code: 'host_not_configured' });
});

test('callback JSON reader rejects malformed and oversized bodies', async () => {
  assert.deepEqual(await readBoundedRequestJson(new Request('https://local', { method: 'POST', body: '{' }), 32), { ok: false, status: 400 });
  assert.deepEqual(await readBoundedRequestJson(new Request('https://local', { method: 'POST', body: 'x'.repeat(40) }), 32), { ok: false, status: 413 });
  assert.deepEqual(await readBoundedRequestJson(new Request('https://local', { method: 'POST', body: JSON.stringify(payload) }), 4096), { ok: true, value: payload });
});

test('callback credentials are distinct, fail closed, and accept only configured rotation overlap', () => {
  const current = 'c'.repeat(40);
  const previous = 'p'.repeat(40);
  assert.equal(validImageDirectCallbackCredential(current, current, undefined), true);
  assert.equal(validImageDirectCallbackCredential(previous, current, previous), true);
  assert.equal(validImageDirectCallbackCredential('t'.repeat(40), current, undefined), false);
  assert.equal(validImageDirectCallbackCredential('weak', 'weak', undefined), false);
  assert.equal(validImageDirectCallbackCredential('', '', undefined), false);
});
