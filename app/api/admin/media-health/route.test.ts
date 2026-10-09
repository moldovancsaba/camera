import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { admin?: boolean } = {}) {
  const batches: unknown[] = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { email: 'a@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ collection: () => ({ countDocuments: async () => 7 }) }) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/media/broken', {
    namedExports: {
      scanFilter: () => ({}),
      scanBatch: async (_db: unknown, o: unknown) => (batches.push(o), { processed: 3, counts: { fine: 2, marked: 1 }, next: null, remaining: 0 }),
    },
  });
  return { batches };
}
const post = (body?: unknown) => new NextRequest('http://localhost/api/admin/media-health', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const get = () => new NextRequest('http://localhost/api/admin/media-health');

test('a global admin reads the counts and runs a batch from a cursor', async (t) => {
  const { batches } = setup(t);
  const { GET, POST } = await importRoute('ok');
  assert.deepEqual(((await (await GET(get())).json()) as { data: unknown }).data, { unchecked: 7, broken: 7 });
  const after = new ObjectId().toHexString();
  assert.equal((await POST(post({ after, limit: 20, maxAgeDays: 0 }))).status, 200);
  const o = batches[0] as { after: ObjectId; limit: number; maxAgeDays: number };
  assert.equal(String(o.after), after);
  assert.equal(o.limit, 20);
  assert.equal(o.maxAgeDays, 0);
  assert.equal((await POST(post())).status, 200, 'no body starts the walk');
});

test('a bad cursor, limit or age is a 400, and anybody who is not a global admin is refused', async (t) => {
  const { batches } = setup(t);
  const { POST } = await importRoute('bad');
  assert.equal((await POST(post({ after: 'nope' }))).status, 400);
  assert.equal((await POST(post({ limit: 'many' }))).status, 400);
  assert.equal((await POST(post({ maxAgeDays: -1 }))).status, 400);
  assert.equal(batches.length, 0);
});

test('anybody who is not a global admin is refused: nothing is read or checked', async (t) => {
  const { batches } = setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  assert.equal((await GET(get())).status, 403);
  assert.equal((await POST(post({}))).status, 403);
  assert.equal(batches.length, 0);
});
