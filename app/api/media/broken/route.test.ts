import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: import('node:test').TestContext, options: { limited?: boolean } = {}) {
  const reports: unknown[] = [];
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      checkRateLimit: async () => {
        if (options.limited) throw apiReal.apiError('Too many requests', 429);
      },
    },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/media/broken', { namedExports: { reportBroken: async (_db: unknown, id: unknown) => (reports.push(id), 'marked') } });
  return { reports };
}
const post = (body?: unknown) => new NextRequest('http://localhost/api/media/broken', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('a screen reports a picture it could not load: the server checks it and answers what it found, no sign-in needed', async (t) => {
  const { reports } = setup(t);
  const { POST } = await importRoute('ok');
  const res = await POST(post({ submissionId: 'abc' }));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: { outcome: string } }).data.outcome, 'marked');
  assert.deepEqual(reports, ['abc']);
});

test('no body is a report about nothing, not an error', async (t) => {
  const { reports } = setup(t);
  const { POST } = await importRoute('empty');
  assert.equal((await POST(post())).status, 200);
  assert.deepEqual(reports, [undefined]);
});

test('the route is rate limited: a screen cannot make the server ask a picture host without end', async (t) => {
  const { reports } = setup(t, { limited: true });
  const { POST } = await importRoute('limited');
  assert.equal((await POST(post({ submissionId: 'abc' }))).status, 429);
  assert.equal(reports.length, 0);
});
