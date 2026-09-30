import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

// WHAT: The internal email route accepts either the messmass or the fanmass
//     service secret, through assertInternalMessmassSecret and
//     assertInternalFanmassSecret (CAM-05 / SEC-09).
// WHY: Pins the hardened contract end to end: every rejection is a bare 403
//     "Forbidden" that names no env var, an unset secret fails closed, the
//     reason reaches the server log only, and a legitimate fanmass call does
//     not log a false messmass rejection on the way through the fallback.

type RouteModule = typeof import('./route');

const MESSMASS_SECRET = 'messmass-secret-for-test-0123456789';
const FANMASS_SECRET = 'fanmass-secret-for-test-0123456789';

// A fresh (uncached) query string per call so each test's mocks bind to their
// own import of route.ts (same pattern as internal/tryon/sync).
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

function mockDeps(t: import('node:test').TestContext) {
  const sent: Array<{ to: string; from?: string }> = [];
  t.mock.module('@/lib/email/send', {
    namedExports: {
      getVerifiedSendingDomain: () => 'mail.example.test',
      sendEmail: async (input: { to: string; from?: string }) => {
        sent.push({ to: input.to, from: input.from });
        return { sent: true, messageId: 'msg_1' };
      },
    },
  });
  const errors = t.mock.method(console, 'error', () => {});
  const warns = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
  return { sent, errors, warns };
}

function setSecrets(messmass: string | undefined, fanmass: string | undefined) {
  if (messmass === undefined) delete process.env.CAMERA_MESSMASS_INTERNAL_SECRET;
  else process.env.CAMERA_MESSMASS_INTERNAL_SECRET = messmass;
  if (fanmass === undefined) delete process.env.CAMERA_FANMASS_INTERNAL_SECRET;
  else process.env.CAMERA_FANMASS_INTERNAL_SECRET = fanmass;
  // In-memory rate limiter only; never reach a real Upstash instance from a unit test.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

function buildPost(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/internal/email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ to: 'guest@example.test', subject: 'Hello', html: '<p>Hi</p>' }),
  });
}

function allLogText(...mocks: Array<{ mock: { calls: Array<{ arguments: unknown[] }> } }>): string {
  return mocks.flatMap((m) => m.mock.calls.flatMap((c) => c.arguments.map(String))).join('\n');
}

test('POST: both secrets unset fails closed with a generic 403; the env var names go to the server log only', async (t) => {
  const { sent, errors, warns } = mockDeps(t);
  setSecrets(undefined, undefined);

  const { POST } = await importRouteModule('unset');
  const res = await POST(buildPost({ authorization: 'Bearer anything' }));

  assert.equal(res.status, 403);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { success: false, error: 'Forbidden' });
  assert.doesNotMatch(text, /CAMERA_|not configured|messmass|fanmass/i);
  assert.equal(sent.length, 0);

  const logged = allLogText(errors, warns);
  assert.match(logged, /CAMERA_MESSMASS_INTERNAL_SECRET is not configured/);
  assert.match(logged, /CAMERA_FANMASS_INTERNAL_SECRET is not configured/);
});

test('POST: an empty credential never matches, even with whitespace-only secrets configured', async (t) => {
  const { sent } = mockDeps(t);
  setSecrets('   ', '   ');

  const { POST } = await importRouteModule('whitespace');
  const res = await POST(buildPost({ 'x-messmass-secret': '   ', 'x-fanmass-secret': '   ' }));

  assert.equal(res.status, 403);
  assert.equal(sent.length, 0);
});

test('POST: a wrong secret (same length, and a prefix) is a generic 403 and the secrets are never logged', async (t) => {
  const { sent, errors, warns } = mockDeps(t);
  setSecrets(MESSMASS_SECRET, FANMASS_SECRET);

  const { POST } = await importRouteModule('mismatch');
  const sameLength = 'x'.repeat(MESSMASS_SECRET.length);
  for (const presented of [sameLength, MESSMASS_SECRET.slice(0, 8)]) {
    const res = await POST(buildPost({ authorization: `Bearer ${presented}` }));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { success: false, error: 'Forbidden' });
  }

  assert.equal(sent.length, 0);
  assert.ok(warns.mock.callCount() > 0, 'a presented-but-wrong secret is logged as a warning');
  const logged = allLogText(errors, warns);
  assert.ok(!logged.includes(MESSMASS_SECRET), 'configured messmass secret must not be logged');
  assert.ok(!logged.includes(FANMASS_SECRET), 'configured fanmass secret must not be logged');
  assert.ok(!logged.includes(sameLength), 'presented secret must not be logged');
});

test('POST: the messmass secret passes and sends as messmass', async (t) => {
  const { sent } = mockDeps(t);
  setSecrets(MESSMASS_SECRET, FANMASS_SECRET);

  const { POST } = await importRouteModule('messmass-ok');
  const res = await POST(buildPost({ authorization: `Bearer ${MESSMASS_SECRET}` }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: { sent: true, messageId: 'msg_1' } });
  assert.deepEqual(sent, [{ to: 'guest@example.test', from: '"messmass" <notifications@mail.example.test>' }]);
});

test('POST: the fanmass secret passes via x-fanmass-secret without logging a false messmass rejection', async (t) => {
  const { sent, errors, warns } = mockDeps(t);
  setSecrets(MESSMASS_SECRET, FANMASS_SECRET);

  const { POST } = await importRouteModule('fanmass-ok');
  const res = await POST(buildPost({ 'x-fanmass-secret': FANMASS_SECRET }));

  assert.equal(res.status, 200);
  assert.deepEqual(sent, [{ to: 'guest@example.test', from: '"fanmass" <notifications@mail.example.test>' }]);
  assert.equal(errors.mock.callCount(), 0);
  assert.equal(warns.mock.callCount(), 0);
});
