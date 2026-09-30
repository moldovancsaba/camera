import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';

// WHAT: POST /api/internal/messmass/sso-session with SSO stubbed at fetch
//     level (userinfo + the app-permission read) and session minting
//     replaced by a recorder.
// WHY: SSO refuses a messmass-issued token read access to camera's permission
//     record (sso 6fb1b6a7), and the route turned that 403 into an
//     error-level 500 on every messmass login. It must answer 403 instead,
//     while a real SSO failure still surfaces as a 500.

const MESSMASS_SECRET = 'messmass-secret-for-test-1';
process.env.CAMERA_MESSMASS_INTERNAL_SECRET = MESSMASS_SECRET;
process.env.SSO_BASE_URL = 'https://sso.example.test';
process.env.SSO_CLIENT_ID = 'camera-client-id-for-test';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const sessionsMinted: Array<{ userId: string; appRole: string | undefined }> = [];

const sessionReal = await import('@/lib/auth/session');
mock.module('@/lib/auth/session', {
  namedExports: {
    ...sessionReal,
    createSession: async (user: { id: string }, _tokens: unknown, permission?: { appRole?: string }) => {
      sessionsMinted.push({ userId: user.id, appRole: permission?.appRole });
      return {};
    },
  },
});

const { POST } = await import('./route');

type PermissionAnswer = { status: number; body: unknown };

function stubSso(t: import('node:test').TestContext, permission: PermissionAnswer) {
  const permissionCalls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://sso.example.test/api/oauth/userinfo') {
      return Response.json({ sub: 'sso-user-1', email: 'admin@example.com' });
    }
    if (url.endsWith('/api/users/sso-user-1/apps/camera-client-id-for-test/permissions')) {
      permissionCalls.push(url);
      return typeof permission.body === 'string'
        ? new Response(permission.body, { status: permission.status })
        : Response.json(permission.body, { status: permission.status });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return permissionCalls;
}

function callSsoSession() {
  sessionsMinted.length = 0;
  return POST(
    new NextRequest('http://localhost/api/internal/messmass/sso-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-messmass-secret': MESSMASS_SECRET },
      body: JSON.stringify({ accessToken: 'messmass-issued-token', refreshToken: 'r', expiresIn: 3600 }),
    })
  );
}

test('SSO 403 on the permission read (messmass-issued token) answers 403, not 500, and mints no session', async (t) => {
  const permissionCalls = stubSso(t, {
    status: 403,
    body: { error: 'Forbidden', message: 'Access token cannot read this permission record' },
  });
  const warnings = t.mock.method(console, 'warn', () => {});

  const res = await callSsoSession();

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { success: false, error: 'sso_token_cannot_read_camera_permission' });
  assert.equal(permissionCalls.length, 1);
  assert.deepEqual(sessionsMinted, []);
  assert.equal(warnings.mock.callCount(), 1);
});

test('SSO 401 on the permission read is also a 403', async (t) => {
  stubSso(t, { status: 401, body: { error: 'invalid_token' } });
  t.mock.method(console, 'warn', () => {});

  const res = await callSsoSession();

  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'sso_token_cannot_read_camera_permission');
  assert.deepEqual(sessionsMinted, []);
});

test('an SSO outage on the permission read still surfaces as a 500', async (t) => {
  stubSso(t, { status: 502, body: 'Bad Gateway' });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});

  const res = await callSsoSession();

  assert.equal(res.status, 500);
  assert.deepEqual(sessionsMinted, []);
});

test('no permission record (SSO 404) is still the existing no_access 403', async (t) => {
  stubSso(t, { status: 404, body: { error: 'Not found' } });

  const res = await callSsoSession();

  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'no_access');
  assert.deepEqual(sessionsMinted, []);
});

test('a readable, approved permission mints the camera session with its role', async (t) => {
  stubSso(t, {
    status: 200,
    body: {
      userId: 'sso-user-1',
      clientId: 'camera-client-id-for-test',
      appName: 'camera',
      hasAccess: true,
      status: 'approved',
      role: 'admin',
    },
  });

  const res = await callSsoSession();

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, appRole: 'admin' });
  assert.deepEqual(sessionsMinted, [{ userId: 'sso-user-1', appRole: 'admin' }]);
});
