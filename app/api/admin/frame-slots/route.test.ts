import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { admin?: boolean } = {}) {
  const calls: Array<{ fn: string; scope: unknown; arg?: unknown }> = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { email: 'a@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/frame/default-slots', {
    namedExports: {
      defaultSlotsView: async (_db: unknown, scope: unknown) => (calls.push({ fn: 'view', scope }), { slots: null, inherited: null, messages: [], sampleEvent: null, followers: 3 }),
      saveDefaultSlots: async (_db: unknown, scope: unknown, body: unknown) => (calls.push({ fn: 'save', scope, arg: body }), { slots: null, followers: [] }),
      runDefaultSlotsAction: async (_db: unknown, scope: unknown, body: unknown) => (calls.push({ fn: 'action', scope, arg: body }), { total: 2, generated: 2, reused: 0 }),
    },
  });
  return { calls };
}
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/admin/frame-slots', { method, body: body === undefined ? undefined : JSON.stringify(body) });

test('a global admin reads, saves and uses the general default', async (t) => {
  const { calls } = setup(t);
  const { GET, PUT, POST } = await importRoute('ok');
  assert.equal(((await (await GET(req('GET'))).json()) as { data: { followers: number } }).data.followers, 3);
  assert.equal((await PUT(req('PUT', { reset: true }))).status, 200);
  assert.equal((await POST(req('POST', { action: 'preview', slots: {} }))).status, 200);
  assert.deepEqual(calls.map((c) => [c.fn, c.scope]), [['view', 'global'], ['save', 'global'], ['action', 'global']]);
  assert.equal((await PUT(req('PUT'))).status, 400);
  assert.equal((await POST(req('POST'))).status, 400);
});

test('anybody who is not a global admin is refused and nothing is read, saved or drawn', async (t) => {
  const { calls } = setup(t, { admin: false });
  const { GET, PUT, POST } = await importRoute('forbidden');
  assert.equal((await GET(req('GET'))).status, 403);
  assert.equal((await PUT(req('PUT', { reset: true }))).status, 403);
  assert.equal((await POST(req('POST', { action: 'preview' }))).status, 403);
  assert.equal(calls.length, 0);
});
