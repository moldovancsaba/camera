import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const URL_BACKFILL = 'http://localhost/api/admin/welcome-screen-backfill';

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const runs: Array<{ ids: readonly string[] }> = [];
  let plans = 0;
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { id: 'u1', email: 'a@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/screen/welcome-backfill', {
    namedExports: {
      BACKFILL_MAX_IDS: 400,
      planBackfill: async () => (plans += 1, { today: '2026-10-11', rolloutOn: true, totals: { events: 2, withPicture: 1, toDo: 1 }, rows: [] }),
      runBackfill: async (_db: unknown, ids: readonly string[]) => (runs.push({ ids }), { results: [], remaining: [], counts: { drawn: ids.length, 'already-done': 0, 'not-found': 0, failed: 0 } }),
    },
  });
  return { runs, plans: () => plans };
}
const post = (body?: unknown) => new NextRequest(URL_BACKFILL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('GET is the dry run: it counts and lists, and runs nothing', async (t) => {
  const { runs, plans } = setup(t);
  const { GET } = await importRoute('get');
  const res = await GET(new NextRequest(URL_BACKFILL));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: { totals: { toDo: number } } }).data.totals.toDo, 1);
  assert.equal(plans(), 1);
  assert.equal(runs.length, 0);
});

test('POST runs only with confirm: true and the ids of the events; anything else is refused and nothing is made', async (t) => {
  const { runs } = setup(t);
  const { POST } = await importRoute('post-refused');
  for (const body of [undefined, {}, { eventIds: ['a'] }, { confirm: 'yes', eventIds: ['a'] }, { confirm: false, eventIds: ['a'] }, { confirm: true }, { confirm: true, eventIds: [] }, { confirm: true, eventIds: 'all' }, { confirm: true, eventIds: [1] }, { confirm: true, eventIds: Array.from({ length: 401 }, (_, i) => `id${i}`) }]) {
    assert.equal((await POST(post(body))).status, 400, JSON.stringify(body)?.slice(0, 60));
  }
  assert.equal(runs.length, 0, 'there is no way to run it for "all"');
});

test('POST with the ids and confirm: true runs exactly those events', async (t) => {
  const { runs } = setup(t);
  const { POST } = await importRoute('post-ok');
  const res = await POST(post({ confirm: true, eventIds: ['a', 'b'] }));
  assert.equal(res.status, 200);
  assert.deepEqual(runs, [{ ids: ['a', 'b'] }]);
  assert.equal(((await res.json()) as { data: { counts: { drawn: number } } }).data.counts.drawn, 2);
});

test('GET and POST are for global admins only: anyone else gets 403 and nothing is read or made', async (t) => {
  const { runs, plans } = setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(URL_BACKFILL))).status, 403);
  assert.equal((await POST(post({ confirm: true, eventIds: ['a'] }))).status, 403);
  assert.equal(plans(), 0);
  assert.equal(runs.length, 0);
});
