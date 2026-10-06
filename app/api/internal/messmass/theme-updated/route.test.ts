import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { deny?: boolean } = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/messmass/internal', {
    namedExports: {
      assertInternalMessmassSecret: () => {
        if (options.deny) throw apiReal.apiForbidden();
      },
    },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ marker: 'db' }) } });
  t.mock.module('@/lib/theme/refresh', {
    namedExports: {
      markThemeStale: async (_db: unknown, ids: unknown) => (calls.push({ fn: 'mark', args: [ids] }), 4),
      refreshStaleEvents: async (_db: unknown, options: unknown) => (calls.push({ fn: 'refresh', args: [options] }), { refreshed: 3, unavailable: 0, failed: 0, remaining: 1 }),
    },
  });
  return calls;
}

const post = (body?: unknown) => new NextRequest('http://localhost/api/internal/messmass/theme-updated', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const ID = 'a'.repeat(24);

test('without the secret nothing is marked or refreshed', async (t) => {
  const calls = setup(t, { deny: true });
  const { POST } = await importRoute('deny');
  assert.equal((await POST(post({ scope: 'all' }))).status, 403);
  assert.deepEqual(calls, []);
});

test('a style change marks every linked event and refreshes the first ones', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('all');
  const response = await POST(post({ scope: 'all' }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { marked: 4, refreshed: 3, unavailable: 0, failed: 0, remaining: 1 });
  assert.deepEqual(calls[0], { fn: 'mark', args: [null] });
  assert.deepEqual(calls[1].args[0], { limit: 12, budgetMs: 40_000 });
});

test('a partner change marks the events it names', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('events');
  assert.equal((await POST(post({ scope: 'events', messmassEventIds: [ID] }))).status, 200);
  assert.deepEqual(calls[0], { fn: 'mark', args: [[ID]] });
});

test('anything else is a 400 and marks nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('bad');
  for (const body of [undefined, {}, { scope: 'x' }, { scope: 'events' }, { scope: 'events', messmassEventIds: [] }, { scope: 'events', messmassEventIds: ['nope'] }, { scope: 'events', messmassEventIds: Array(501).fill(ID) }]) {
    assert.equal((await POST(post(body))).status, 400, JSON.stringify(body)?.slice(0, 40));
  }
  assert.deepEqual(calls, []);
});
