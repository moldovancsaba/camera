import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import type { TryOnJob, TryOnJobStatus } from '@/lib/db/schemas';
import { cancelTryOnJob, type CancellableJobsCollection } from './route';

function baseJob(overrides: Partial<TryOnJob> = {}): TryOnJob {
  return {
    jobId: 'job-1',
    requestHash: 'hash-1',
    status: 'queued',
    stage: 'queued',
    pipeline: 'motogp_leather_magic',
    pipelineVersion: '1',
    source: {
      app: 'camera',
      submissionId: 'submission-1',
      imageUrl: 'https://example.com/source.jpg',
    },
    request: {
      leatherSuitId: 'suit-1',
    },
    processing: {
      attemptCount: 0,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
    },
    result: {},
    error: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function applySet(target: Record<string, unknown>, setOps: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(setOps)) {
    const parts = path.split('.');
    let obj = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = obj[parts[i]];
      obj[parts[i]] = next && typeof next === 'object' ? next : {};
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
  }
}

/**
 * A minimal in-memory stand-in for the tryon_jobs collection. `updateOne`
 * only writes when the live (not snapshotted) status is still in the
 * filter's $in list -- exactly the compare-and-set semantics the real
 * MongoDB filter enforces -- so a test can simulate the worker's race by
 * mutating `current.status` between a `findOne` and the subsequent
 * `updateOne`.
 */
function createFakeJobsCollection(initial: TryOnJob, onFindOne?: (current: TryOnJob) => void) {
  const current: TryOnJob = { ...initial };
  let updateOneCallCount = 0;

  const collection: CancellableJobsCollection = {
    async findOne(filter) {
      if (filter.jobId !== current.jobId) return null;
      const snapshot: TryOnJob = JSON.parse(JSON.stringify(current));
      onFindOne?.(current);
      return snapshot;
    },
    async updateOne(filter, update) {
      updateOneCallCount += 1;
      if (filter.jobId !== current.jobId || !filter.status.$in.includes(current.status)) {
        return { matchedCount: 0 };
      }
      applySet(current as unknown as Record<string, unknown>, update.$set);
      return { matchedCount: 1 };
    },
  };

  return {
    collection,
    get current(): TryOnJob {
      return current;
    },
    get updateOneCallCount(): number {
      return updateOneCallCount;
    },
  };
}

async function captureThrown(fn: () => Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await fn();
  } catch (thrown) {
    assert.ok(thrown instanceof NextResponse, 'expected a NextResponse error');
    const body = (await (thrown as NextResponse).json()) as { error: string };
    return { status: (thrown as NextResponse).status, message: body.error };
  }
  assert.fail('expected the call to throw');
}

test('cancels a queued job with no concurrent interference', async () => {
  const fake = createFakeJobsCollection(baseJob({ status: 'queued' }));
  const result = await cancelTryOnJob(fake.collection, 'job-1', 'admin@example.com');

  assert.equal(result.job.status, 'queued');
  assert.equal(fake.current.status, 'cancelled');
  assert.equal(fake.current.stage, 'cancelled');
  assert.equal(fake.updateOneCallCount, 1);
});

test('cancels a retry_wait job with no concurrent interference', async () => {
  const fake = createFakeJobsCollection(baseJob({ status: 'retry_wait' }));
  const result = await cancelTryOnJob(fake.collection, 'job-1', 'admin@example.com');

  assert.equal(result.job.status, 'retry_wait');
  assert.equal(fake.current.status, 'cancelled');
});

test('returns a clear error and leaves the job processing when the worker wins the race', async () => {
  const fake = createFakeJobsCollection(baseJob({ status: 'queued' }), (current) => {
    // Simulates the worker claiming the job in the gap between this route's
    // read and its write.
    current.status = 'processing' as TryOnJobStatus;
  });

  const { status, message } = await captureThrown(() =>
    cancelTryOnJob(fake.collection, 'job-1', 'admin@example.com')
  );

  assert.equal(status, 400);
  assert.match(message, /claimed by the worker/i);
  assert.equal(fake.current.status, 'processing');
  assert.equal(fake.updateOneCallCount, 1);
});

test('already-cancelled job returns the same clear error with no write attempted', async () => {
  const fake = createFakeJobsCollection(baseJob({ status: 'cancelled' }));

  const { status, message } = await captureThrown(() =>
    cancelTryOnJob(fake.collection, 'job-1', 'admin@example.com')
  );

  assert.equal(status, 400);
  assert.match(message, /Only queued or retry-wait jobs can be cancelled\. Current status: cancelled/);
  assert.equal(fake.current.status, 'cancelled');
  assert.equal(fake.updateOneCallCount, 0);
});

test('missing job returns not found', async () => {
  const fake = createFakeJobsCollection(baseJob({ jobId: 'other-job' }));

  const { status } = await captureThrown(() => cancelTryOnJob(fake.collection, 'job-1', 'admin@example.com'));

  assert.equal(status, 404);
});
