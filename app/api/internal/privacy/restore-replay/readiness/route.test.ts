import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from './route';

const original = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  CAMERA_PRIVACY_RESTORE_MODE: process.env.CAMERA_PRIVACY_RESTORE_MODE,
  CAMERA_PRIVACY_RESTORE_DATABASE_NAME: process.env.CAMERA_PRIVACY_RESTORE_DATABASE_NAME,
  CAMERA_PRIVACY_RESTORE_INSTANCE_ID: process.env.CAMERA_PRIVACY_RESTORE_INSTANCE_ID,
  CAMERA_PRIVACY_RESTORE_SECRET: process.env.CAMERA_PRIVACY_RESTORE_SECRET,
  MONGODB_DB: process.env.MONGODB_DB,
};

function configure() {
  process.env.VERCEL_ENV = 'preview';
  process.env.CAMERA_PRIVACY_RESTORE_MODE = 'isolated';
  process.env.CAMERA_PRIVACY_RESTORE_DATABASE_NAME = 'camera_restore_20261023';
  process.env.CAMERA_PRIVACY_RESTORE_INSTANCE_ID = 'restore-run-20261023-a1b2c3d4';
  process.env.CAMERA_PRIVACY_RESTORE_SECRET = 'restore-only-secret';
  process.env.MONGODB_DB = 'camera_restore_20261023';
}

test('restore readiness hides on production and authenticates preview restore deployments', async () => {
  try {
    configure();
    process.env.VERCEL_ENV = 'production';
    const hidden = await GET(new NextRequest('https://camera.example/api/internal/privacy/restore-replay/readiness'));
    assert.equal(hidden.status, 404);

    process.env.VERCEL_ENV = 'preview';
    const denied = await GET(new NextRequest('https://camera-preview.example/api/internal/privacy/restore-replay/readiness'));
    assert.equal(denied.status, 403);
    const allowed = await GET(new NextRequest('https://camera-preview.example/api/internal/privacy/restore-replay/readiness', {
      headers: { 'x-camera-privacy-restore-secret': 'restore-only-secret' },
    }));
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await allowed.json() as { data: Record<string, unknown> };
    assert.deepEqual(body.data, { version: 1, mode: 'isolated', databaseName: 'camera_restore_20261023', instanceId: 'restore-run-20261023-a1b2c3d4' });
    assert.equal(JSON.stringify(body).includes('mongodb'), false);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
