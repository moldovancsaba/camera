import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';

// WHAT: Mocks getSession and the preference write, not requireAdmin.
//     Registered once, before anything imports '@/lib/api'; tests change
//     the mutable state below.
// WHY: lib/api/middleware.ts binds to getSession when it first loads, so
//     mocking one level below it runs the real role gate in every test
//     (same approach as app/api/upload-logo/route.test.ts).
let currentSession: Session | null = null;
const upserts: Array<{ cameraId: string; setupId: string; updatedBy: string | null | undefined }> = [];

const SERVICE_SECRET = 'setup-selection-secret-for-test';

const sessionReal = await import('@/lib/auth/session');
const mongoReal = await import('@/lib/db/mongodb');
const setupResolutionReal = await import('@/lib/tryon/setup-resolution');
mock.module('@/lib/auth/session', {
  namedExports: { ...sessionReal, getSession: async () => currentSession },
});
mock.module('@/lib/db/mongodb', {
  namedExports: { ...mongoReal, connectToDatabase: async () => ({}) },
});
mock.module('@/lib/tryon/setup-resolution', {
  namedExports: {
    ...setupResolutionReal,
    upsertCameraSetupPreference: async (
      _db: unknown,
      cameraId: string,
      setupId: string,
      updatedBy?: string | null
    ) => {
      upserts.push({ cameraId, setupId, updatedBy });
      return { cameraId, setupId, updatedAt: '2026-01-01T00:00:00.000Z' };
    },
  },
});

const { POST } = await import('./route');

function buildSession(appRole: Session['appRole'], appAccess: boolean): Session {
  return {
    user: { id: 'user-1', email: 'someone@example.com' },
    accessToken: 'token',
    refreshToken: 'refresh',
    accessTokenExpiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    appRole,
    appAccess,
  } as Session;
}

function callUse(headers: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  const request = new NextRequest('http://localhost/api/tryon/setups/setup_a/use', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ cameraId: 'cam-1', ...body }),
  });
  return POST(request, { params: Promise.resolve({ setupId: 'setup_a' }) });
}

function reset(session: Session | null) {
  currentSession = session;
  upserts.length = 0;
  process.env.TRYON_SETUP_SELECTION_SECRET = SERVICE_SECRET;
}

test('POST: no session and no service secret is rejected with 401 and nothing is written', async () => {
  reset(null);
  const res = await callUse();
  assert.equal(res.status, 401);
  assert.equal(upserts.length, 0);
});

test('POST: a guest capture session (appRole none, no app access) is rejected with 403', async () => {
  reset(buildSession('none', false));
  const res = await callUse();
  assert.equal(res.status, 403);
  assert.equal(upserts.length, 0);
});

test('POST: a plain user session is rejected with 403', async () => {
  reset(buildSession('user', true));
  const res = await callUse();
  assert.equal(res.status, 403);
  assert.equal(upserts.length, 0);
});

test('POST: a plain user session with a wrong service secret is still rejected with 403', async () => {
  reset(buildSession('user', true));
  const res = await callUse({ 'x-camera-setup-secret': 'not-the-secret' });
  assert.equal(res.status, 403);
  assert.equal(upserts.length, 0);
});

test('POST: an admin session sets the camera preference, attributed to the admin', async () => {
  reset(buildSession('admin', true));
  const res = await callUse();
  assert.equal(res.status, 200);
  assert.deepEqual(upserts, [{ cameraId: 'cam-1', setupId: 'setup_a', updatedBy: 'someone@example.com' }]);
});

test('POST: an admin session cannot attribute the change to someone else through the body', async () => {
  reset(buildSession('admin', true));
  const res = await callUse({}, { updatedBy: 'other.admin@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(upserts, [{ cameraId: 'cam-1', setupId: 'setup_a', updatedBy: 'someone@example.com' }]);
});

test('POST: the service-secret path records the caller-supplied updatedBy', async () => {
  reset(null);
  const res = await callUse({ 'x-camera-setup-secret': SERVICE_SECRET }, { updatedBy: 'kiosk-7' });
  assert.equal(res.status, 200);
  assert.deepEqual(upserts, [{ cameraId: 'cam-1', setupId: 'setup_a', updatedBy: 'kiosk-7' }]);
});

test('POST: the service secret with no session still works (kiosk automation path)', async () => {
  reset(null);
  const res = await callUse({ 'x-camera-setup-secret': SERVICE_SECRET });
  assert.equal(res.status, 200);
  assert.deepEqual(upserts, [{ cameraId: 'cam-1', setupId: 'setup_a', updatedBy: 'camera' }]);
});

test('POST: with the service secret unset, a guest session sending an empty secret is rejected with 403', async () => {
  reset(buildSession('none', false));
  delete process.env.TRYON_SETUP_SELECTION_SECRET;
  const res = await callUse({ 'x-camera-setup-secret': '' });
  assert.equal(res.status, 403);
  assert.equal(upserts.length, 0);
});
