import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { deny?: boolean } = {}) {
  const calls: Array<{ fn: string; scope: unknown; arg?: unknown; role?: unknown }> = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { email: 'm@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (_db: unknown, _s: unknown, _id: string, role: unknown) => {
        calls.push({ fn: 'access', scope: null, role });
        if (options.deny) throw apiReal.apiForbidden('No access to this partner');
        return { partner: { partnerId: 'p-uuid', name: 'MTK' } };
      },
    },
  });
  t.mock.module('@/lib/frame/default-slots', {
    namedExports: {
      defaultSlotsView: async (_db: unknown, scope: unknown) => (calls.push({ fn: 'view', scope }), { slots: null, inherited: null, messages: ['Go'], sampleEvent: null, followers: 0 }),
      saveDefaultSlots: async (_db: unknown, scope: unknown, body: unknown) => (calls.push({ fn: 'save', scope, arg: body }), { slots: null, followers: [{ id: 'e1', eventId: 'x', name: 'MTK x Vasas' }] }),
      runDefaultSlotsAction: async (_db: unknown, scope: unknown, body: unknown) => (calls.push({ fn: 'action', scope, arg: body }), { total: 1, generated: 1, reused: 0 }),
    },
  });
  return { calls };
}
const ctx = { params: Promise.resolve({ partnerId: 'abc' }) };
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/partners/abc/frame-slots', { method, body: body === undefined ? undefined : JSON.stringify(body) });

test('GET shows the partner\'s default to a viewer, for the partner\'s own id', async (t) => {
  const { calls } = setup(t);
  const { GET } = await importRoute('get');
  const res = await GET(req('GET'), ctx);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: { name: string } }).data.name, 'MTK');
  assert.deepEqual(calls.map((c) => [c.fn, c.role ?? c.scope]), [['access', 'viewer'], ['view', { partnerId: 'p-uuid' }]]);
});

test('PUT saves the default for a manager and returns the events to redraw', async (t) => {
  const { calls } = setup(t);
  const { PUT } = await importRoute('put');
  const res = await PUT(req('PUT', { slots: { text: {}, picture: {} } }), ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { data: { followers: Array<{ id: string }> } }).data.followers.map((f) => f.id), ['e1']);
  assert.equal(calls[0].role, 'manager');
  assert.deepEqual(calls[1].scope, { partnerId: 'p-uuid' });
  assert.equal((await PUT(req('PUT'), ctx)).status, 400, 'no body');
});

test('POST runs a preview or a redraw for a manager; no body is a 400', async (t) => {
  const { calls } = setup(t);
  const { POST } = await importRoute('post');
  assert.equal((await POST(req('POST', { action: 'redraw', eventId: 'e1' }), ctx)).status, 200);
  assert.deepEqual(calls.find((c) => c.fn === 'action')?.arg, { action: 'redraw', eventId: 'e1' });
  assert.equal((await POST(req('POST'), ctx)).status, 400);
});

test('a caller without access to the partner is refused and nothing is saved or drawn', async (t) => {
  const { calls } = setup(t, { deny: true });
  const { PUT, POST } = await importRoute('deny');
  assert.equal((await PUT(req('PUT', { reset: true }), ctx)).status, 403);
  assert.equal((await POST(req('POST', { action: 'preview' }), ctx)).status, 403);
  assert.equal(calls.some((c) => c.fn !== 'access'), false);
});
