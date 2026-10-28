import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const EVENT_MONGO_ID = '6ac636415fa8994cb2d3df85';

function setup(t: TestContext, environment: 'preview' | 'production') {
  const previousCronSecret = process.env.CRON_SECRET;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.VERCEL_ENV = environment;
  t.after(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  });
  const calls: Array<{ db: unknown; options: unknown }> = [];
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => ({ marker: 'db' }) } });
  t.mock.module('@/lib/photo-moderation/worker', {
    exports: {
      runModerationPrecheckWorker: async (db: unknown, options: unknown) => {
        calls.push({ db, options });
        return { status: 'processed', submitted: 0, completed: 0, flagged: 0, uncertain: 0, failed: 0, waiting: 0 };
      },
    },
  });
  return calls;
}

function request(url: string, options: { eventScope?: boolean; purpose?: string } = {}) {
  return new NextRequest(url, {
    headers: {
      authorization: 'Bearer test-cron-secret',
      ...(options.eventScope ? { 'x-request-purpose': options.purpose ?? 'test' } : {}),
    },
  });
}

test('preview worker fails closed unless the request is explicitly scoped to a test event', async (t) => {
  const calls = setup(t, 'preview');
  const { GET } = await load('preview-requires-scope');
  assert.equal((await GET(request('http://localhost/api/internal/photo-moderation-precheck'))).status, 403);
  assert.equal((await GET(request(`http://localhost/api/internal/photo-moderation-precheck?eventMongoId=${EVENT_MONGO_ID}`))).status, 403);
  assert.deepEqual(calls, []);
});

test('preview worker accepts only valid event-scoped test runs and limits them to one image', async (t) => {
  const calls = setup(t, 'preview');
  const { GET } = await load('preview-scoped-run');
  assert.equal((await GET(request('http://localhost/api/internal/photo-moderation-precheck?eventMongoId=bad', { eventScope: true }))).status, 400);
  const response = await GET(request(`http://localhost/api/internal/photo-moderation-precheck?eventMongoId=${EVENT_MONGO_ID}`, { eventScope: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ db: { marker: 'db' }, options: { eventMongoId: EVENT_MONGO_ID, maxBatch: 1 } }]);
});

test('production cron remains global and refuses preview-only event scoping', async (t) => {
  const calls = setup(t, 'production');
  const { GET } = await load('production-global');
  assert.equal((await GET(request('http://localhost/api/internal/photo-moderation-precheck'))).status, 200);
  assert.equal((await GET(request(`http://localhost/api/internal/photo-moderation-precheck?eventMongoId=${EVENT_MONGO_ID}`, { eventScope: true }))).status, 400);
  assert.deepEqual(calls, [{ db: { marker: 'db' }, options: {} }]);
});
