import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';

// WHAT: Mocks the session source (getSession), the database and the image
//     store -- not requireAuth. Every mock is registered once, before
//     anything imports '@/lib/api', and reads the mutable state below.
// WHY: lib/api/middleware.ts binds to getSession when it first loads, so a
//     per-test mock would only reach the first test. Mocking one level
//     below the middleware means the real role gate runs in every test.
let currentSession: Session | null = null;
let partnerAccessRows: Array<Record<string, unknown>> = [];
const uploadCalls: string[] = [];

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const fakeDb = {
  collection: (name: string) => ({
    find: (filter: Record<string, unknown>) => ({
      toArray: async () =>
        name === 'partner_user_access'
          ? partnerAccessRows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value))
          : [],
    }),
  }),
};

const sessionReal = await import('@/lib/auth/session');
const mongoReal = await import('@/lib/db/mongodb');
mock.module('@/lib/auth/session', {
  namedExports: { ...sessionReal, getSession: async () => currentSession },
});
mock.module('@/lib/db/mongodb', {
  namedExports: { ...mongoReal, connectToDatabase: async () => fakeDb },
});
mock.module('@/lib/imgbb/upload', {
  namedExports: {
    uploadImage: async (base64: string) => {
      uploadCalls.push(base64);
      return {
        success: true,
        imageUrl: 'https://blob.example/logo.png',
        thumbnailUrl: 'https://blob.example/logo.png',
        deleteUrl: '',
        imageId: '',
        fileSize: 4,
        mimeType: 'image/png',
        fileName: 'logo.png',
        provider: 'blob',
        mirrorImageUrl: null,
      };
    },
  },
});

const { POST } = await import('./route');

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const SMALL_PNG_DATA_URL = `data:image/png;base64,${Buffer.from('tiny-png').toString('base64')}`;

function buildSession(appRole: Session['appRole'], appAccess: boolean, email = 'someone@example.com'): Session {
  return {
    user: { id: `id-${email}`, email },
    accessToken: 'token',
    refreshToken: 'refresh',
    accessTokenExpiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    appRole,
    appAccess,
  } as Session;
}

// Each test sends from its own client IP, so the per-IP upload rate limit
// bucket of one test never affects another.
function buildPost(ip: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/upload-logo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: JSON.stringify(body),
  });
}

function reset(session: Session | null, rows: Array<Record<string, unknown>> = []) {
  currentSession = session;
  partnerAccessRows = rows;
  uploadCalls.length = 0;
}

test('no session is rejected with 401 and nothing is uploaded', async () => {
  reset(null);
  const res = await POST(buildPost('10.0.0.1', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 401);
  assert.equal(uploadCalls.length, 0);
});

test('a guest capture session (appRole none, no app access) is rejected with 403', async () => {
  reset(buildSession('none', false));
  const res = await POST(buildPost('10.0.0.2', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 403);
  assert.equal(uploadCalls.length, 0);
});

test('a plain user session with no partner access is rejected with 403', async () => {
  reset(buildSession('user', true));
  const res = await POST(buildPost('10.0.0.3', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 403);
  assert.equal(uploadCalls.length, 0);
});

test('a partner Events viewer is rejected with 403 (event edits need manager)', async () => {
  const email = 'viewer@example.com';
  reset(buildSession('user', true, email), [
    { userEmail: email, appKey: 'events', role: 'viewer', isActive: true, accessId: 'a1', partnerId: 'p1' },
  ]);
  const res = await POST(buildPost('10.0.0.4', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 403);
  assert.equal(uploadCalls.length, 0);
});

test('a deactivated partner Events manager assignment is rejected with 403', async () => {
  const email = 'former-manager@example.com';
  reset(buildSession('user', true, email), [
    { userEmail: email, appKey: 'events', role: 'manager', isActive: false, accessId: 'a2', partnerId: 'p1' },
  ]);
  const res = await POST(buildPost('10.0.0.5', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 403);
  assert.equal(uploadCalls.length, 0);
});

test('a partner Events manager can upload (the event forms admit them)', async () => {
  const email = 'manager@example.com';
  reset(buildSession('user', true, email), [
    { userEmail: email, appKey: 'events', role: 'manager', isActive: true, accessId: 'a3', partnerId: 'p1' },
  ]);
  const res = await POST(buildPost('10.0.0.6', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 201);
  assert.equal(uploadCalls.length, 1);
});

test('an admin session uploads the base64 payload without its data-URL prefix', async () => {
  reset(buildSession('admin', true));
  const res = await POST(buildPost('10.0.0.7', { imageData: SMALL_PNG_DATA_URL, name: 'event-logo' }));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { data: { imageUrl: string } };
  assert.equal(body.data.imageUrl, 'https://blob.example/logo.png');
  assert.deepEqual(uploadCalls, [Buffer.from('tiny-png').toString('base64')]);
});

test('an admin role without app access is still rejected with 403', async () => {
  reset(buildSession('admin', false));
  const res = await POST(buildPost('10.0.0.8', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(res.status, 403);
  assert.equal(uploadCalls.length, 0);
});

test('an image over the decoded size cap is rejected with 413 and nothing is uploaded', async () => {
  reset(buildSession('admin', true));
  const oversize = Buffer.alloc(MAX_LOGO_BYTES + 1).toString('base64');
  const res = await POST(buildPost('10.0.0.9', { imageData: `data:image/png;base64,${oversize}` }));
  assert.equal(res.status, 413);
  assert.equal(uploadCalls.length, 0);
});

test('an image exactly at the size cap is accepted', async () => {
  reset(buildSession('admin', true));
  const atCap = Buffer.alloc(MAX_LOGO_BYTES).toString('base64');
  const res = await POST(buildPost('10.0.0.10', { imageData: atCap }));
  assert.equal(res.status, 201);
  assert.equal(uploadCalls.length, 1);
});

test('a declared Content-Length over the body cap is rejected with 413 before parsing', async () => {
  reset(buildSession('admin', true));
  const res = await POST(
    buildPost('10.0.0.11', { imageData: SMALL_PNG_DATA_URL }, { 'content-length': String(8 * 1024 * 1024) })
  );
  assert.equal(res.status, 413);
  assert.equal(uploadCalls.length, 0);
});

test('missing image data is rejected with 400', async () => {
  reset(buildSession('admin', true));
  const res = await POST(buildPost('10.0.0.12', { name: 'no-image' }));
  assert.equal(res.status, 400);
  assert.equal(uploadCalls.length, 0);
});

test('the upload rate limit (RATE_LIMITS.UPLOAD, 10 per minute per client) returns 429 on the 11th call', async () => {
  reset(buildSession('admin', true));
  for (let i = 0; i < 10; i++) {
    const res = await POST(buildPost('10.0.0.13', { imageData: SMALL_PNG_DATA_URL }));
    assert.equal(res.status, 201, `call ${i + 1} should pass`);
  }
  const limited = await POST(buildPost('10.0.0.13', { imageData: SMALL_PNG_DATA_URL }));
  assert.equal(limited.status, 429);
  assert.equal(uploadCalls.length, 10);
});
