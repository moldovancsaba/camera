import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { createFakeDb } from '@/lib/tryon/sync.fake-db';

const completionReal = await import('@/lib/tryon/completion');

type RouteModule = typeof import('./route');
type FakeDb = ReturnType<typeof createFakeDb>;

const JOB_ID = 'job_20260911182715_abcd1234';
const OTHER_JOB_ID = 'job_20260910090000_0badc0de';
const CRON_SECRET = 'cron-secret-for-test';
const INTERNAL_SECRET = 'internal-secret-for-test';

// A fresh (uncached) query string per call so each test's mocks bind to their
// own import of route.ts (same pattern as tryon-results/[submissionId]/remove).
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

function doneJob(jobId: string, updatedAt: string) {
  return {
    jobId,
    status: 'done',
    updatedAt,
    source: { submissionId: '650000000000000000000001' },
    result: { publicResultUrl: `https://example.public.blob.vercel-storage.com/${jobId}.png` },
  };
}

interface RouteHarness {
  fake: FakeDb;
  applyCalls: string[];
  connectCalls: number;
}

// WHAT: The route runs against an in-memory DB; only the completion write
//     itself (applyCompletionFromJobResult) is replaced. The stand-in records
//     the call and inserts the derived result submission, the same marker the
//     real applyTryOnCompletion leaves behind.
// WHY: The CAM-02 property under test is "a second run with nothing new
//     applies nothing", which only shows if the first run's marker is visible
//     to the second run's selection.
function mockRouteDeps(t: import('node:test').TestContext, fake: FakeDb = createFakeDb()): RouteHarness {
  const harness: RouteHarness = { fake, applyCalls: [], connectCalls: 0 };
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => {
        harness.connectCalls += 1;
        return fake.db;
      },
    },
  });
  t.mock.module('@/lib/tryon/completion', {
    namedExports: {
      ...completionReal,
      applyCompletionFromJobResult: async (db: Db, job: { jobId: string }) => {
        harness.applyCalls.push(job.jobId);
        await db.collection(COLLECTIONS.SUBMISSIONS).insertOne({ sourceJobId: job.jobId, submissionKind: 'tryon_result' });
        return { action: 'created', resultSubmissionId: `result-for-${job.jobId}` };
      },
    },
  });
  return harness;
}

function useCronSecret() {
  process.env.CRON_SECRET = CRON_SECRET;
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;
}

function buildGet(query = '?status=done&limit=5', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/internal/tryon/sync${query}`, { method: 'GET', headers });
}

function buildCronGet(query?: string): NextRequest {
  return buildGet(query, { authorization: `Bearer ${CRON_SECRET}` });
}

function buildPost(body: unknown, query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/internal/tryon/sync${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-camera-tryon-secret': INTERNAL_SECRET },
    body: JSON.stringify(body),
  });
}

interface SyncBody {
  data?: {
    status?: string;
    jobId?: string | null;
    limit?: number;
    outcomes?: { scanned?: number; created?: number; skipped?: number; failed?: number };
  };
  error?: string;
}

// --- Auth (camera#119, CAM-05) ------------------------------------------------

test('GET: a spoofed x-vercel-cron header with no secret is rejected with 403', async (t) => {
  const harness = mockRouteDeps(t);
  useCronSecret();

  const { GET } = await importRouteModule('spoofed-cron');
  const res = await GET(buildGet(undefined, { 'x-vercel-cron': '1' }));

  assert.equal(res.status, 403);
  assert.deepEqual(harness.applyCalls, []);
});

test('GET: no auth headers at all is rejected with 403', async (t) => {
  const harness = mockRouteDeps(t);
  useCronSecret();

  const { GET } = await importRouteModule('no-headers');
  const res = await GET(buildGet());

  assert.equal(res.status, 403);
  assert.deepEqual(harness.applyCalls, []);
});

test('GET: fails closed with 403 when CRON_SECRET is unset, even with a Bearer header', async (t) => {
  const harness = mockRouteDeps(t);
  delete process.env.CRON_SECRET;
  delete process.env.CAMERA_TRYON_INTERNAL_SECRET;

  const { GET } = await importRouteModule('unset-secret');
  const res = await GET(buildGet(undefined, { authorization: 'Bearer anything' }));

  assert.equal(res.status, 403);
  assert.deepEqual(harness.applyCalls, []);
});

test('GET: the correct Authorization: Bearer <CRON_SECRET> passes the auth stage and runs the sync', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [doneJob(JOB_ID, '2026-09-11T18:28:20.000Z')],
  }));
  useCronSecret();

  const { GET } = await importRouteModule('valid-cron');
  const res = await GET(buildCronGet());

  assert.equal(res.status, 200);
  assert.deepEqual(harness.applyCalls, [JOB_ID]);
  const body = (await res.json()) as SyncBody;
  assert.equal(body.data?.outcomes?.scanned, 1);
  assert.equal(body.data?.outcomes?.created, 1);
});

// --- CAM-09: ?jobId= takes the real job id format ------------------------------

test('GET: ?jobId=job_<stamp>_<hex8> reaches the jobs query as a string and syncs only that job', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob(JOB_ID, '2026-09-11T18:28:20.000Z'),
      doneJob(OTHER_JOB_ID, '2026-09-12T00:00:00.000Z'),
    ],
  }));
  useCronSecret();

  const { GET } = await importRouteModule('get-job-id');
  const res = await GET(buildCronGet(`?jobId=${JOB_ID}`));

  assert.equal(res.status, 200);
  const jobReads = harness.fake.reads.filter((read) => read.collection === COLLECTIONS.TRYON_JOBS);
  assert.equal(jobReads[0].filter.jobId, JOB_ID);
  assert.deepEqual(harness.applyCalls, [JOB_ID]);
  const body = (await res.json()) as SyncBody;
  assert.equal(body.data?.jobId, JOB_ID);
  assert.equal(body.data?.outcomes?.scanned, 1);
});

test('POST: body { jobId } with the internal secret reaches the jobs query and syncs only that job', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob(JOB_ID, '2026-09-11T18:28:20.000Z'),
      doneJob(OTHER_JOB_ID, '2026-09-12T00:00:00.000Z'),
    ],
  }));
  delete process.env.CRON_SECRET;
  process.env.CAMERA_TRYON_INTERNAL_SECRET = INTERNAL_SECRET;

  const { POST } = await importRouteModule('post-job-id');
  const res = await POST(buildPost({ jobId: JOB_ID }));

  assert.equal(res.status, 200);
  const jobReads = harness.fake.reads.filter((read) => read.collection === COLLECTIONS.TRYON_JOBS);
  assert.equal(jobReads[0].filter.jobId, JOB_ID);
  assert.deepEqual(harness.applyCalls, [JOB_ID]);
});

test('POST: ?jobId= in the query works when the body has none', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [doneJob(JOB_ID, '2026-09-11T18:28:20.000Z'), doneJob(OTHER_JOB_ID, '2026-09-12T00:00:00.000Z')],
  }));
  delete process.env.CRON_SECRET;
  process.env.CAMERA_TRYON_INTERNAL_SECRET = INTERNAL_SECRET;

  const { POST } = await importRouteModule('post-query-job-id');
  const res = await POST(buildPost({}, `?jobId=${JOB_ID}`));

  assert.equal(res.status, 200);
  assert.deepEqual(harness.applyCalls, [JOB_ID]);
});

test('GET: a jobId that is not a job id (an ObjectId, garbage) is a 400 before any database access', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [doneJob(JOB_ID, '2026-09-11T18:28:20.000Z')],
  }));
  useCronSecret();

  const { GET } = await importRouteModule('bad-job-id');
  for (const badJobId of ['650000000000000000000001', 'job_1', 'job_20260911182715_ABCD1234']) {
    const res = await GET(buildCronGet(`?jobId=${badJobId}`));
    assert.equal(res.status, 400, `expected 400 for ${badJobId}`);
    const body = (await res.json()) as SyncBody;
    assert.match(body.error ?? '', /Invalid jobId/);
  }
  assert.equal(harness.connectCalls, 0);
  assert.deepEqual(harness.applyCalls, []);
});

test('POST: a non-string body jobId is a 400, never a crash or a silent full sync', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [doneJob(JOB_ID, '2026-09-11T18:28:20.000Z')],
  }));
  delete process.env.CRON_SECRET;
  process.env.CAMERA_TRYON_INTERNAL_SECRET = INTERNAL_SECRET;

  const { POST } = await importRouteModule('post-non-string-job-id');
  for (const jobId of [{ $ne: null }, 12345, [JOB_ID]]) {
    const res = await POST(buildPost({ jobId }));
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(jobId)}`);
  }
  assert.equal(harness.connectCalls, 0);
  assert.deepEqual(harness.applyCalls, []);
});

// --- CAM-02: idempotent backstop ---------------------------------------------

test('GET: a second run with nothing new applies nothing and writes nothing', async (t) => {
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob('job_20260911000000_00000003', '2026-09-11T00:00:00.000Z'), // callback never landed
      doneJob('job_20260910000000_00000002', '2026-09-10T00:00:00.000Z'), // already applied
      doneJob('job_20260909000000_00000001', '2026-09-09T00:00:00.000Z'), // result removed by an admin
    ],
    [COLLECTIONS.SUBMISSIONS]: [{ sourceJobId: 'job_20260910000000_00000002', submissionKind: 'tryon_result' }],
    [COLLECTIONS.TRYON_MODERATION_EVENTS]: [{ sourceJobId: 'job_20260909000000_00000001', action: 'remove' }],
  });
  const harness = mockRouteDeps(t, fake);
  useCronSecret();

  const { GET } = await importRouteModule('idempotent');

  const first = await GET(buildCronGet('?status=done&limit=50'));
  assert.equal(first.status, 200);
  assert.deepEqual(harness.applyCalls, ['job_20260911000000_00000003']);
  const firstBody = (await first.json()) as SyncBody;
  assert.equal(firstBody.data?.outcomes?.scanned, 1);
  assert.equal(firstBody.data?.outcomes?.skipped, 2);

  const writesAfterFirstRun = fake.writes.length;
  const second = await GET(buildCronGet('?status=done&limit=50'));
  assert.equal(second.status, 200);
  assert.deepEqual(harness.applyCalls, ['job_20260911000000_00000003'], 'nothing re-applied on the second run');
  assert.equal(fake.writes.length, writesAfterFirstRun, 'the second run wrote nothing');
  const secondBody = (await second.json()) as SyncBody;
  assert.equal(secondBody.data?.outcomes?.scanned, 0);
  assert.equal(secondBody.data?.outcomes?.skipped, 3);
});

test('GET: ?jobId= for a job that is already applied is skipped, not re-applied', async (t) => {
  const harness = mockRouteDeps(t, createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [doneJob(JOB_ID, '2026-09-11T18:28:20.000Z')],
    [COLLECTIONS.SUBMISSIONS]: [{ sourceJobId: JOB_ID, submissionKind: 'tryon_result' }],
  }));
  useCronSecret();

  const { GET } = await importRouteModule('job-id-applied');
  const res = await GET(buildCronGet(`?jobId=${JOB_ID}`));

  assert.equal(res.status, 200);
  assert.deepEqual(harness.applyCalls, []);
  const body = (await res.json()) as SyncBody;
  assert.equal(body.data?.outcomes?.scanned, 0);
  assert.equal(body.data?.outcomes?.skipped, 1);
  assert.deepEqual(harness.fake.writes, []);
});

test('GET: limit is capped at 100 and non-numeric limits fall back to 25', async (t) => {
  mockRouteDeps(t);
  useCronSecret();

  const { GET } = await importRouteModule('limits');
  const capped = (await (await GET(buildCronGet('?limit=5000'))).json()) as SyncBody;
  assert.equal(capped.data?.limit, 100);
  const fallback = (await (await GET(buildCronGet('?limit=abc'))).json()) as SyncBody;
  assert.equal(fallback.data?.limit, 25);
});
