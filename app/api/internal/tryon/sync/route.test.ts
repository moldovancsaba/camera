import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const completionReal = await import('@/lib/tryon/completion');

type RouteModule = typeof import('./route');

// A fresh (uncached) query string per call so each test's mocks bind to their
// own import of route.ts (same pattern as tryon-results/[submissionId]/remove).
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

function mockRouteDeps(t: import('node:test').TestContext, applyCalls: string[]) {
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({
          find: () => ({
            sort: () => ({
              limit: () => ({
                toArray: async () => [{ jobId: 'job_1', status: 'done', result: { publicResultUrl: 'https://i.ibb.co/x/y.png' } }],
              }),
            }),
          }),
        }),
      }),
    },
  });
  t.mock.module('@/lib/tryon/completion', {
    namedExports: {
      ...completionReal,
      applyCompletionFromJobResult: async (_db: unknown, job: { jobId: string }) => {
        applyCalls.push(job.jobId);
        return { action: 'unchanged', resultSubmissionId: null };
      },
    },
  });
}

function buildGet(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/internal/tryon/sync?status=done&limit=5', { method: 'GET', headers });
}

test('GET: a spoofed x-vercel-cron header with no secret is rejected with 403', async (t) => {
  const applyCalls: string[] = [];
  mockRouteDeps(t, applyCalls);
  process.env.CRON_SECRET = 'cron-secret-for-test';
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;

  const { GET } = await importRouteModule('spoofed-cron');
  const res = await GET(buildGet({ 'x-vercel-cron': '1' }));

  assert.equal(res.status, 403);
  assert.deepEqual(applyCalls, []);
});

test('GET: no auth headers at all is rejected with 403', async (t) => {
  const applyCalls: string[] = [];
  mockRouteDeps(t, applyCalls);
  process.env.CRON_SECRET = 'cron-secret-for-test';
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;

  const { GET } = await importRouteModule('no-headers');
  const res = await GET(buildGet());

  assert.equal(res.status, 403);
  assert.deepEqual(applyCalls, []);
});

test('GET: fails closed with 403 when CRON_SECRET is unset, even with a Bearer header', async (t) => {
  const applyCalls: string[] = [];
  mockRouteDeps(t, applyCalls);
  delete process.env.CRON_SECRET;
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;

  const { GET } = await importRouteModule('unset-secret');
  const res = await GET(buildGet({ authorization: 'Bearer anything' }));

  assert.equal(res.status, 403);
  assert.deepEqual(applyCalls, []);
});

test('GET: the correct Authorization: Bearer <CRON_SECRET> passes the auth stage and runs the sync', async (t) => {
  const applyCalls: string[] = [];
  mockRouteDeps(t, applyCalls);
  process.env.CRON_SECRET = 'cron-secret-for-test';
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;

  const { GET } = await importRouteModule('valid-cron');
  const res = await GET(buildGet({ authorization: 'Bearer cron-secret-for-test' }));

  assert.notEqual(res.status, 403);
  assert.equal(res.status, 200);
  assert.deepEqual(applyCalls, ['job_1']);
  const body = (await res.json()) as { data?: { outcomes?: { scanned?: number } } };
  assert.equal(body.data?.outcomes?.scanned, 1);
});
