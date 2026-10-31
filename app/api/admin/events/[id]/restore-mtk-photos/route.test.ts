import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const calls: string[] = [];
  t.mock.module('@/lib/api', {
    exports: {
      ...apiReal,
      requireAuth: async () => ({ user: { id: 'owner-1', email: 'owner@example.test' } }),
      checkRateLimit: async () => { calls.push('rate-limit'); },
    },
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => { calls.push('database'); return { marker: 'db' }; } } });
  t.mock.module('@/lib/partners/authorization', { exports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/mtk-photo-restoration', {
    exports: {
      MTK_RESTORATION_EVENT_MONGO_ID: '6ac636415fa8994cb2d3df85',
      getMtkRestorationProgress: async (db: unknown) => (calls.push(`status:${(db as { marker: string }).marker}`), { restored: 39, remaining: 1, total: 40, complete: false }),
      restoreNextMtkPhoto: async (db: unknown, actor: string) => (calls.push(`restore:${(db as { marker: string }).marker}:${actor}`), { status: 'restored', restored: 40, remaining: 0, total: 40, complete: true }),
    },
  });
  return calls;
}

const get = (id = '6ac636415fa8994cb2d3df85') => new NextRequest(`http://localhost/api/admin/events/${id}/restore-mtk-photos`);
const post = (id = '6ac636415fa8994cb2d3df85') => new NextRequest(`http://localhost/api/admin/events/${id}/restore-mtk-photos`, { method: 'POST' });
const context = (id = '6ac636415fa8994cb2d3df85') => ({ params: Promise.resolve({ id }) });

test('global admin reads only aggregate MTK restoration progress', async (t) => {
  const calls = setup(t);
  const { GET } = await importRoute('status');
  const response = await GET(get(), context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.deepEqual((await response.json()).data, { restored: 39, remaining: 1, total: 40, complete: false });
  assert.deepEqual(calls, ['database', 'status:db']);
});

test('restore processes exactly one image for the authenticated operator', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('one-photo');
  const response = await POST(post(), context());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { status: 'restored', restored: 40, remaining: 0, total: 40, complete: true });
  assert.deepEqual(calls, ['rate-limit', 'database', 'restore:db:owner@example.test']);
});

test('wrong event cannot access or change the batch', async (t) => {
  const calls = setup(t);
  const { GET, POST } = await importRoute('scope');
  assert.equal((await GET(get('6ac636415fa8994cb2d3df86'), context('6ac636415fa8994cb2d3df86'))).status, 400);
  assert.equal((await POST(post('6ac636415fa8994cb2d3df86'), context('6ac636415fa8994cb2d3df86'))).status, 400);
  assert.deepEqual(calls, []);
});

test('non-global admins cannot access or change the batch', async (t) => {
  setup(t, { admin: false });
  const { GET: deniedGet, POST: deniedPost } = await importRoute('denied');
  assert.equal((await deniedGet(get(), context())).status, 403);
  assert.equal((await deniedPost(post(), context())).status, 403);
});
