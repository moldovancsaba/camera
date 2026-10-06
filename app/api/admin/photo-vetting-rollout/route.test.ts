import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { deny?: boolean } = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      requireAdmin: async () => {
        if (options.deny) throw apiReal.apiForbidden('Admin access required for this app');
        return { user: { id: 'u1', email: 'admin@example.com' } };
      },
      checkRateLimit: async () => undefined,
    },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ marker: 'db' }) } });
  t.mock.module('@/lib/photo-vetting/rollout', {
    namedExports: {
      rolloutDryRun: async () => (calls.push({ fn: 'dryRun', args: [] }), { toTurnOn: 5 }),
      runRollout: async (_db: unknown, email: unknown) => (calls.push({ fn: 'run', args: [email] }), { turnedOn: 5 }),
    },
  });
  return calls;
}

const post = (body?: unknown) => new NextRequest('http://localhost/api/admin/photo-vetting-rollout', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('only an admin may call it', async (t) => {
  const calls = setup(t, { deny: true });
  const { POST } = await importRoute('deny');
  assert.equal((await POST(post({ mode: 'run' }))).status, 403);
  assert.deepEqual(calls, []);
});

test('a dry run reports and changes nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('dry');
  const response = await POST(post({ mode: 'dry-run' }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { report: { toTurnOn: 5 } });
  assert.deepEqual(calls.map((c) => c.fn), ['dryRun']);
});

test('a run is attributed to the admin who started it', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('run');
  const response = await POST(post({ mode: 'run' }));
  assert.deepEqual((await response.json()).data, { result: { turnedOn: 5 } });
  assert.deepEqual(calls, [{ fn: 'run', args: ['admin@example.com'] }]);
});

test('anything else is a 400 and starts nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('bad');
  assert.equal((await POST(post({ mode: 'everything' }))).status, 400);
  assert.equal((await POST(post())).status, 400);
  assert.deepEqual(calls, []);
});
