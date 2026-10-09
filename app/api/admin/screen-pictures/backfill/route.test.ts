import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { admin?: boolean } = {}) {
  const batches: unknown[] = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { id: 'u1', email: 'a@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/submissions/screen-backfill', {
    namedExports: {
      screenBackfillStatus: async () => ({ remaining: 352, events: 10 }),
      runScreenBackfillBatch: async (_db: unknown, o: unknown) => (batches.push(o), { processed: 2, counts: { made: 2 }, beforeBytes: 10, afterBytes: 2, next: null, remaining: 0 }),
    },
  });
  return { batches };
}
const post = (body?: unknown) => new NextRequest('http://localhost/api/admin/screen-pictures/backfill', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('GET tells how many photos still lack a screen picture, to a global admin', async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const res = await GET(new NextRequest('http://localhost/api/admin/screen-pictures/backfill'));
  assert.deepEqual(((await res.json()) as { data: unknown }).data, { remaining: 352, events: 10 });
});

test('POST makes a batch from the cursor it is given', async (t) => {
  const { batches } = setup(t);
  const { POST } = await importRoute('post');
  const after = new ObjectId().toHexString();
  const res = await POST(post({ limit: 12, after }));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: { processed: number } }).data.processed, 2);
  const options = batches[0] as { limit: number; after: ObjectId };
  assert.equal(options.limit, 12);
  assert.equal(String(options.after), after);
});

test('POST with no body starts the walk from the beginning', async (t) => {
  const { batches } = setup(t);
  const { POST } = await importRoute('empty');
  assert.equal((await POST(post())).status, 200);
  assert.deepEqual(batches[0], { limit: undefined, after: undefined, eventId: undefined });
});

test('POST refuses a bad cursor or limit', async (t) => {
  const { batches } = setup(t);
  const { POST } = await importRoute('bad');
  assert.equal((await POST(post({ after: 'not-an-id' }))).status, 400);
  assert.equal((await POST(post({ limit: 'many' }))).status, 400);
  assert.equal(batches.length, 0);
});

test('POST and GET are for global admins only: anyone else gets 403 and nothing is made', async (t) => {
  const { batches } = setup(t, { admin: false });
  const { POST, GET } = await importRoute('forbidden');
  assert.equal((await POST(post({}))).status, 403);
  assert.equal((await GET(new NextRequest('http://localhost/api/admin/screen-pictures/backfill'))).status, 403);
  assert.equal(batches.length, 0);
});
