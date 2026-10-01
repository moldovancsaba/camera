import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './route';

test('image.direct completion requires its dedicated callback credential and stays unavailable by default', async () => {
  const original = {
    token: process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN,
    previous: process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS,
    enabled: process.env.CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED,
  };
  process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN = 'callback-secret-that-is-not-legacy';
  delete process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS;
  process.env.CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED = 'false';
  try {
    const denied = await POST(new Request('https://camera.example/api/internal/image-direct/complete', { method: 'POST' }) as never);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('Cache-Control'), 'no-store');
    const legacyOnly = await POST(new Request('https://camera.example/api/internal/image-direct/complete', {
      method: 'POST',
      headers: { 'x-camera-tryon-secret': 'callback-secret-that-is-not-legacy' },
    }) as never);
    assert.equal(legacyOnly.status, 403);
    const admittedButOff = await POST(new Request('https://camera.example/api/internal/image-direct/complete', {
      method: 'POST',
      headers: { 'x-camera-image-direct-callback-token': 'callback-secret-that-is-not-legacy' },
    }) as never);
    assert.equal(admittedButOff.status, 503);
    assert.equal(admittedButOff.headers.get('Cache-Control'), 'no-store');
  } finally {
    if (original.token === undefined) delete process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN;
    else process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN = original.token;
    if (original.previous === undefined) delete process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS;
    else process.env.CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS = original.previous;
    if (original.enabled === undefined) delete process.env.CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED;
    else process.env.CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED = original.enabled;
  }
});
