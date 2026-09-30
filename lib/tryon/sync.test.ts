import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLECTIONS } from '@/lib/db/schemas';
import { createTryOnJobId } from '@/lib/tryon/hash';
import { createFakeDb } from './sync.fake-db';
import {
  buildEligibleJobsQuery,
  findAppliedTryOnJobIds,
  isTryOnJobId,
  resolveCompletionReapplySource,
  selectJobsPendingCompletion,
} from './sync';

function doneJob(jobId: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    jobId,
    status: 'done',
    updatedAt,
    source: { submissionId: '650000000000000000000001' },
    result: { publicResultUrl: `https://example.public.blob.vercel-storage.com/${jobId}.png` },
    ...extra,
  };
}

// --- CAM-09: job id format ---------------------------------------------------

test('isTryOnJobId accepts what createTryOnJobId mints and the documented example', () => {
  assert.equal(isTryOnJobId(createTryOnJobId()), true);
  assert.equal(isTryOnJobId(createTryOnJobId(new Date('2026-09-11T18:27:15.000Z'))), true);
  assert.equal(isTryOnJobId('job_20260911182715_abcd1234'), true);
});

test('isTryOnJobId rejects ObjectIds and anything that is not a minted job id', () => {
  for (const value of [
    '650000000000000000000001', // a Mongo ObjectId: what the route used to demand
    'job_1',
    'job_20260911182715_ABCD1234', // randomUUID is lowercase hex
    'job_2026091118271_abcd1234', // 13-digit stamp
    'job_20260911182715_abcd12345',
    ' job_20260911182715_abcd1234',
    'job_20260911182715_abcd1234\n',
    'e2e-job-1727000000000',
    '',
    null,
    undefined,
    42,
    { $ne: null },
  ]) {
    assert.equal(isTryOnJobId(value), false, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('buildEligibleJobsQuery filters on the string job id, never an ObjectId', () => {
  assert.deepEqual(buildEligibleJobsQuery({ status: 'done' }), {
    status: 'done',
    'result.publicResultUrl': { $type: 'string' },
  });
  assert.deepEqual(buildEligibleJobsQuery({ status: 'failed', jobId: ' job_20260911182715_abcd1234 ' }), {
    status: 'failed',
    'result.publicResultUrl': { $type: 'string' },
    jobId: 'job_20260911182715_abcd1234',
  });
});

// --- CAM-02: completion markers ----------------------------------------------

test('findAppliedTryOnJobIds: a derived result or an admin "remove" event marks a job applied; other events do not', async () => {
  const fake = createFakeDb({
    [COLLECTIONS.SUBMISSIONS]: [
      { sourceJobId: 'job_20260901000000_aaaaaaaa', submissionKind: 'tryon_result' },
      { submissionKind: 'photo' },
    ],
    [COLLECTIONS.TRYON_MODERATION_EVENTS]: [
      { sourceJobId: 'job_20260902000000_bbbbbbbb', action: 'remove' },
      { sourceJobId: 'job_20260903000000_cccccccc', action: 'reject' },
    ],
  });

  const applied = await findAppliedTryOnJobIds(fake.db, [
    'job_20260901000000_aaaaaaaa',
    'job_20260902000000_bbbbbbbb',
    'job_20260903000000_cccccccc',
    'job_20260904000000_dddddddd',
  ]);

  assert.deepEqual([...applied].sort(), ['job_20260901000000_aaaaaaaa', 'job_20260902000000_bbbbbbbb']);
  assert.deepEqual(fake.writes, []);
});

test('findAppliedTryOnJobIds splits large id lists into chunks of 500', async () => {
  const fake = createFakeDb();
  const ids = Array.from({ length: 1201 }, (_, index) => `job_20260901000000_${index.toString(16).padStart(8, '0')}`);

  const applied = await findAppliedTryOnJobIds(fake.db, ids);

  assert.equal(applied.size, 0);
  const submissionReads = fake.reads.filter((read) => read.collection === COLLECTIONS.SUBMISSIONS);
  assert.equal(submissionReads.length, 3);
  assert.deepEqual(
    submissionReads.map((read) => ((read.filter.sourceJobId as { $in: string[] }).$in).length),
    [500, 500, 201]
  );
});

test('findAppliedTryOnJobIds with no ids reads nothing', async () => {
  const fake = createFakeDb();
  assert.equal((await findAppliedTryOnJobIds(fake.db, [])).size, 0);
  assert.deepEqual(fake.reads, []);
});

// --- CAM-02: selection -------------------------------------------------------

test('selectJobsPendingCompletion returns only unapplied jobs, newest first, and counts the skipped ones', async () => {
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob('job_20260905000000_00000005', '2026-09-05T00:00:00.000Z'), // applied (derived)
      doneJob('job_20260904000000_00000004', '2026-09-04T00:00:00.000Z'), // pending
      doneJob('job_20260903000000_00000003', '2026-09-03T00:00:00.000Z'), // removed by an admin
      doneJob('job_20260902000000_00000002', '2026-09-02T00:00:00.000Z'), // pending
      doneJob('job_20260901000000_00000001', '2026-09-01T00:00:00.000Z', { result: {} }), // no result URL
      doneJob('job_20260906000000_00000006', '2026-09-06T00:00:00.000Z', { status: 'failed' }), // other status
    ],
    [COLLECTIONS.SUBMISSIONS]: [{ sourceJobId: 'job_20260905000000_00000005' }],
    [COLLECTIONS.TRYON_MODERATION_EVENTS]: [{ sourceJobId: 'job_20260903000000_00000003', action: 'remove' }],
  });

  const selection = await selectJobsPendingCompletion(fake.db, { status: 'done', limit: 50 });

  assert.deepEqual(selection.jobs.map((job) => job.jobId), [
    'job_20260904000000_00000004',
    'job_20260902000000_00000002',
  ]);
  assert.equal(selection.alreadyApplied, 2);
  // Full documents come back for the jobs that will be applied.
  assert.equal(selection.jobs[0].result.publicResultUrl, 'https://example.public.blob.vercel-storage.com/job_20260904000000_00000004.png');
  assert.deepEqual(fake.writes, []);
});

test('selectJobsPendingCompletion applies the limit after skipping applied jobs, so they never use up a run', async () => {
  const jobs = Array.from({ length: 8 }, (_, index) =>
    doneJob(`job_2026090${index + 1}000000_0000000${index + 1}`, `2026-09-0${index + 1}T00:00:00.000Z`)
  );
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: jobs,
    // The five newest are applied; before CAM-02 a limit of 2 re-applied two of them.
    [COLLECTIONS.SUBMISSIONS]: jobs.slice(3).map((job) => ({ sourceJobId: job.jobId })),
  });

  const selection = await selectJobsPendingCompletion(fake.db, { status: 'done', limit: 2 });

  assert.deepEqual(selection.jobs.map((job) => job.jobId), [
    'job_20260903000000_00000003',
    'job_20260902000000_00000002',
  ]);
  assert.equal(selection.alreadyApplied, 5);
});

test('selectJobsPendingCompletion: when every job is applied the run reads and returns nothing to apply', async () => {
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob('job_20260902000000_00000002', '2026-09-02T00:00:00.000Z'),
      doneJob('job_20260901000000_00000001', '2026-09-01T00:00:00.000Z'),
    ],
    [COLLECTIONS.SUBMISSIONS]: [
      { sourceJobId: 'job_20260902000000_00000002' },
      { sourceJobId: 'job_20260901000000_00000001' },
    ],
  });

  const selection = await selectJobsPendingCompletion(fake.db, { status: 'done', limit: 50 });

  assert.deepEqual(selection, { jobs: [], alreadyApplied: 2 });
  // No third read for full documents when nothing is pending.
  assert.equal(fake.reads.filter((read) => read.collection === COLLECTIONS.TRYON_JOBS).length, 1);
  assert.deepEqual(fake.writes, []);
});

test('selectJobsPendingCompletion with a jobId selects only that job', async () => {
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_JOBS]: [
      doneJob('job_20260911182715_abcd1234', '2026-09-11T18:28:20.000Z'),
      doneJob('job_20260910000000_00000001', '2026-09-10T00:00:00.000Z'),
    ],
  });

  const selection = await selectJobsPendingCompletion(fake.db, {
    status: 'done',
    jobId: 'job_20260911182715_abcd1234',
    limit: 25,
  });

  assert.deepEqual(selection.jobs.map((job) => job.jobId), ['job_20260911182715_abcd1234']);
  assert.equal(fake.reads[0].filter.jobId, 'job_20260911182715_abcd1234');
});

// --- CAM-02: re-application source -------------------------------------------

test('resolveCompletionReapplySource starts from the stored raw result, never the framed composite', () => {
  assert.deepEqual(
    resolveCompletionReapplySource(
      { publicResultUrl: 'https://images.example.com/tryon-framed-1.png', imgbbDeleteUrl: 'https://delete.example.com/framed' },
      'https://example.public.blob.vercel-storage.com/raw.png'
    ),
    // The job's delete URL belongs to the framed composite, not the raw image.
    { publicResultUrl: 'https://example.public.blob.vercel-storage.com/raw.png', deleteUrl: null }
  );
});

test('resolveCompletionReapplySource falls back to the job result when no raw URL is stored', () => {
  const jobResult = { publicResultUrl: 'https://example.public.blob.vercel-storage.com/raw.png', imgbbDeleteUrl: 'https://delete.example.com/raw' };
  const expected = { publicResultUrl: 'https://example.public.blob.vercel-storage.com/raw.png', deleteUrl: 'https://delete.example.com/raw' };
  assert.deepEqual(resolveCompletionReapplySource(jobResult, null), expected);
  assert.deepEqual(resolveCompletionReapplySource(jobResult, undefined), expected);
  assert.deepEqual(resolveCompletionReapplySource(jobResult, '   '), expected);
  assert.deepEqual(resolveCompletionReapplySource(jobResult, 42), expected);
  // Raw equal to the job URL (unframed result): the job's delete URL still applies.
  assert.deepEqual(resolveCompletionReapplySource(jobResult, jobResult.publicResultUrl), expected);
});
