import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';

// WHAT: Mocks getSession and the setup-resolution reads, not requireAdmin.
//     Registered once, before anything imports '@/lib/api'; tests change
//     the mutable state below.
// WHY: lib/api/middleware.ts binds to getSession when it first loads, so
//     mocking one level below it runs the real role gate in every test
//     (same approach as app/api/upload-logo/route.test.ts).
let currentSession: Session | null = null;
const dbReads: string[] = [];

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
    listActiveTryOnSetups: async () => {
      dbReads.push('listActiveTryOnSetups');
      return [{ setupId: 'setup_a', name: 'Setup A', isDefault: true, active: true }];
    },
    getCameraSetupPreference: async (_db: unknown, cameraId: string) => {
      dbReads.push(`getCameraSetupPreference:${cameraId}`);
      return { cameraId, setupId: 'setup_a', updatedAt: '2026-01-01T00:00:00.000Z' };
    },
  },
});

const { GET } = await import('./route');

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

function buildGet(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/tryon/setups${query}`, { method: 'GET' });
}

function reset(session: Session | null) {
  currentSession = session;
  dbReads.length = 0;
}

test('GET: no session is rejected with 401 and nothing is read', async () => {
  reset(null);
  const res = await GET(buildGet());
  assert.equal(res.status, 401);
  assert.deepEqual(dbReads, []);
});

test('GET: a guest capture session (appRole none, no app access) is rejected with 403', async () => {
  reset(buildSession('none', false));
  const res = await GET(buildGet('?cameraId=cam-1'));
  assert.equal(res.status, 403);
  assert.deepEqual(dbReads, []);
});

test('GET: a plain user session is rejected with 403', async () => {
  reset(buildSession('user', true));
  const res = await GET(buildGet('?cameraId=cam-1'));
  assert.equal(res.status, 403);
  assert.deepEqual(dbReads, []);
});

test('GET: an admin role without app access is rejected with 403', async () => {
  reset(buildSession('admin', false));
  const res = await GET(buildGet());
  assert.equal(res.status, 403);
  assert.deepEqual(dbReads, []);
});

test('GET: an admin session gets the active setups and the camera preference', async () => {
  reset(buildSession('admin', true));
  const res = await GET(buildGet('?cameraId=cam-1'));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { setups: Array<{ setupId: string }>; cameraPreference: { setupId: string } | null };
  };
  assert.deepEqual(body.data.setups.map((setup) => setup.setupId), ['setup_a']);
  assert.equal(body.data.cameraPreference?.setupId, 'setup_a');
  assert.deepEqual(dbReads, ['listActiveTryOnSetups', 'getCameraSetupPreference:cam-1']);
});

test('GET: a superadmin session is allowed', async () => {
  reset(buildSession('superadmin', true));
  const res = await GET(buildGet());
  assert.equal(res.status, 200);
  assert.deepEqual(dbReads, ['listActiveTryOnSetups']);
});
