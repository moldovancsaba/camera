import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { deny?: boolean } = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      requireAdmin: async () => {
        if (options.deny) throw apiReal.apiForbidden('Admin access required for this app');
        return { user: { id: 'u1' } };
      },
      checkRateLimit: async () => undefined,
    },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ marker: 'db' }) } });
  t.mock.module('@/lib/frame/backfill', {
    namedExports: {
      dryRun: async (_db: unknown, options: unknown) => (calls.push({ fn: 'dryRun', args: [options] }), { total: 7 }),
      runBackfillBatch: async (_db: unknown, options: unknown) => (calls.push({ fn: 'run', args: [options] }), { processed: 1, done: true }),
    },
  });
  return calls;
}

const post = (body?: unknown) => new NextRequest('http://localhost/api/admin/frame-backfill', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('only an admin may call it', async (t) => {
  const calls = setup(t, { deny: true });
  const { POST } = await importRoute('deny');
  assert.equal((await POST(post({ mode: 'dry-run' }))).status, 403);
  assert.deepEqual(calls, []);
});

test('a dry run is passed on with or without the messmass probe, and nothing else is run', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('dry');
  const plain = await POST(post({ mode: 'dry-run' }));
  assert.equal(plain.status, 200);
  assert.deepEqual((await plain.json()).data, { report: { total: 7 } });
  await POST(post({ mode: 'dry-run', probe: true }));
  await POST(post({ mode: 'dry-run', probe: 'yes' }));
  assert.deepEqual(calls.map((c) => [c.fn, c.args[0]]), [['dryRun', { probe: false }], ['dryRun', { probe: true }], ['dryRun', { probe: false }]]);
});

test('a run takes three events by default, a limit of 1 to 10 and a cursor', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('run');
  assert.deepEqual((await (await POST(post({ mode: 'run' }))).json()).data, { batch: { processed: 1, done: true } });
  await POST(post({ mode: 'run', limit: 10, after: 'abc' }));
  assert.deepEqual(calls.map((c) => c.args[0]), [{ limit: 3, after: null, budgetMs: 35_000 }, { limit: 10, after: 'abc', budgetMs: 35_000 }]);
});

test('bad input is a 400 and starts nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('bad');
  for (const body of [undefined, { mode: 'delete' }, {}, { mode: 'run', limit: 0 }, { mode: 'run', limit: 11 }, { mode: 'run', limit: 2.5 }, { mode: 'run', limit: '3' }, { mode: 'run', after: 7 }, { mode: 'run', after: 'x'.repeat(65) }]) {
    assert.equal((await POST(post(body))).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(calls, []);
});
