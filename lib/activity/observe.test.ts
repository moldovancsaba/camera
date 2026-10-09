import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest, NextResponse } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

type WithHandlerModule = typeof import('@/lib/api/withErrorHandler');
const load = (id: string) => import('@/lib/api/withErrorHandler?case=' + id) as Promise<WithHandlerModule>;

function setup(t: TestContext, session: { user: { id: string; email: string }; appRole: string } | null, enabled = '1') {
  const seeded = fakeDb({});
  process.env.ACTIVITY_LOG = enabled;
  t.after(() => { delete process.env.ACTIVITY_LOG; });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => session } });
  return seeded;
}
const ADMIN = { user: { id: 'u1', email: 'Admin@Example.test' }, appRole: 'admin' };
const request = (method: string, path: string) => new NextRequest(`http://localhost${path}`, { method });
type Route = (request: NextRequest) => Promise<NextResponse>;
/** A handler that ignores its request, as a route the error handler wraps. */
const wrap = (withErrorHandler: WithHandlerModule['withErrorHandler'], fn: () => Promise<NextResponse>) => withErrorHandler<Route>(fn);
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

test('an admin\'s change is written to the log after the answer, and the answer is exactly what the handler gave', async (t) => {
  const { data } = setup(t, ADMIN);
  const { withErrorHandler } = await load('admin-ok');
  const handler = wrap(withErrorHandler, async () => NextResponse.json({ success: true }, { status: 200 }));
  const response = await handler(request('PATCH', '/api/slideshows?id=abc'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  await settle();
  assert.equal(data.activity_log.length, 1);
  assert.equal(data.activity_log[0].userEmail, 'admin@example.test');
  assert.equal(data.activity_log[0].path, '/api/slideshows?id=abc');
  assert.equal(data.activity_log[0].outcome, 'ok');
});

test('a refused request (a thrown answer) and a crash are written with their reason; the answers are unchanged', async (t) => {
  const { data } = setup(t, null);
  const { withErrorHandler } = await load('failures');
  const refused = wrap(withErrorHandler, async () => { throw NextResponse.json({ error: 'Forbidden' }, { status: 403 }); });
  const response = await refused(request('POST', '/api/admin/media-health'));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
  const crash = wrap(withErrorHandler, async () => { throw new Error('secret detail'); });
  const crashed = await crash(request('POST', '/api/events/e1'));
  assert.equal(crashed.status, 500);
  await settle();
  assert.deepEqual(data.activity_log.map((r) => [r.outcome, r.status, r.message, r.userId]), [['refused', 403, 'Forbidden', null], ['error', 500, 'Internal server error', null]]);
  assert.ok(!JSON.stringify(data.activity_log).includes('secret detail'), 'the real error text never reaches the log: only what the answer said');
});

test('a read that worked, and a guest\'s photo, are not written; nothing is written when the log is off', async (t) => {
  const { data } = setup(t, { user: { id: 'g1', email: 'guest@example.test' }, appRole: 'user' });
  const { withErrorHandler } = await load('quiet');
  const ok = wrap(withErrorHandler, async () => NextResponse.json({ ok: true }));
  await ok(request('GET', '/api/events/e1'));
  await ok(request('POST', '/api/submissions'));
  await settle();
  assert.equal(data.activity_log?.length ?? 0, 0);
});

test('nothing is written when the log is off (a preview deployment or a local run)', async (t) => {
  const { data } = setup(t, ADMIN, '0');
  const { withErrorHandler } = await load('off');
  await wrap(withErrorHandler, async () => NextResponse.json({ ok: true }))(request('PATCH', '/api/slideshows?id=abc'));
  await wrap(withErrorHandler, async () => { throw new Error('x'); })(request('POST', '/api/events/e1'));
  await settle();
  assert.equal(data.activity_log?.length ?? 0, 0);
});

test('a log that cannot be written never breaks the request', async (t) => {
  process.env.ACTIVITY_LOG = '1';
  t.after(() => { delete process.env.ACTIVITY_LOG; });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => { throw new Error('down'); } } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ADMIN } });
  const { withErrorHandler } = await load('db-down');
  const response = await wrap(withErrorHandler, async () => NextResponse.json({ ok: true }))(request('PATCH', '/api/slideshows?id=abc'));
  assert.equal(response.status, 200);
  await settle();
});
