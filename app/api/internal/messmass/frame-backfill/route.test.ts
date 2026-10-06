import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { deny?: boolean } = {}) {
  const calls: unknown[] = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/messmass/internal', { namedExports: { assertInternalMessmassSecret: () => { if (options.deny) throw apiReal.apiForbidden(); } } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ marker: 'db' }) } });
  t.mock.module('@/lib/frame/backfill', { namedExports: { runBackfillBatch: async (_db: unknown, options: unknown) => (calls.push(options), { processed: 3, done: false, nextAfter: 'abc' }) } });
  return calls;
}

const post = (body?: unknown) => new NextRequest('http://localhost/api/internal/messmass/frame-backfill', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('without the secret nothing is drawn', async (t) => {
  const calls = setup(t, { deny: true });
  const { POST } = await importRoute('deny');
  assert.equal((await POST(post({}))).status, 403);
  assert.deepEqual(calls, []);
});

test('a batch takes three events by default, a limit of 1 to 10 and a cursor', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('run');
  assert.deepEqual((await (await POST(post({}))).json()).data, { batch: { processed: 3, done: false, nextAfter: 'abc' } });
  await POST(post({ limit: 10, after: 'abc', redraw: true }));
  assert.deepEqual(calls, [
    { limit: 3, after: null, budgetMs: 35_000, redraw: false },
    { limit: 10, after: 'abc', budgetMs: 35_000, redraw: true },
  ]);
});

test('bad input is a 400 and draws nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('bad');
  for (const body of [{ limit: 0 }, { limit: 11 }, { limit: 'x' }, { after: 5 }, { after: 'x'.repeat(65) }]) assert.equal((await POST(post(body))).status, 400, JSON.stringify(body));
  assert.deepEqual(calls, []);
});
