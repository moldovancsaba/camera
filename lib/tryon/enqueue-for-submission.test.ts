import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ObjectId } from 'mongodb';

type Module = typeof import('./enqueue-for-submission');
const importModule = (caseId: string) => import('./enqueue-for-submission?case=' + caseId) as Promise<Module>;

const submissionId = new ObjectId().toHexString();
const BASE = {
  submissionId,
  createdAt: '2026-10-06T12:00:00.000Z',
  eventId: 'event-uuid',
  partnerId: 'p1',
  userId: 'anonymous',
  eventPolicy: { _id: 'e', tryOn: { enabled: true, allowedLeatherSuitIds: ['suit-1'] } },
  request: { requested: true, leatherSuitId: 'suit-1', sourceImageData: 'data:image/jpeg;base64,AAAA' },
};

function setup(t: TestContext) {
  const patches: Array<Record<string, unknown>> = [];
  const jobs: Array<Record<string, unknown>> = [];
  const uploads: string[] = [];
  const db = {
    collection: () => ({ findOne: async () => ({ _id: new ObjectId() }) }),
  };
  t.mock.module('@/lib/imgbb/upload', { namedExports: { uploadImage: async (base64: string) => (uploads.push(base64), { imageUrl: 'https://store.test/source.jpg', deleteUrl: '', imageId: '' }) } });
  t.mock.module('@/lib/tryon/jobs', {
    namedExports: {
      insertOrGetTryOnJob: async (_db: unknown, input: Record<string, unknown>) => (jobs.push(input), { deduplicated: false, job: { jobId: 'job-1', status: 'queued', result: { publicResultUrl: null, imgbbDeleteUrl: null, provider: null } } }),
      patchSubmissionTryOnState: async (_db: unknown, _id: unknown, patch: Record<string, unknown>) => void patches.push(patch),
      upsertSubmissionTryOnLink: async () => undefined,
      buildSubmissionTryOnLink: () => ({}),
    },
  });
  t.mock.module('@/lib/tryon/suits', { namedExports: { assertValidLeatherSuitId: async () => ({ garmentType: 'motorsport_suit', sleeveStyle: null }) } });
  t.mock.module('@/lib/tryon/setup-resolution', { namedExports: { findDefaultSetupForGarmentType: async () => null } });
  t.mock.module('@/lib/tryon/prompts', { namedExports: { buildTryOnPromptSnapshot: () => ({ ok: true, snapshot: {} }) } });
  return { db: db as never, patches, jobs, uploads };
}

test('a valid request stores the source photo, queues one job and records the queued state', async (t) => {
  const { db, patches, jobs, uploads } = setup(t);
  const { enqueueTryOnForSubmission } = await importModule('ok');
  const outcome = await enqueueTryOnForSubmission(db, BASE);
  assert.deepEqual(outcome, { status: 'queued', jobId: 'job-1', error: null });
  assert.deepEqual(uploads, ['AAAA']);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].submissionId, submissionId);
  assert.equal(jobs[0].imageUrl, 'https://store.test/source.jpg');
  assert.equal(jobs[0].eventId, 'event-uuid');
  assert.equal(patches[patches.length - 1].status, 'queued');
  assert.equal(patches[patches.length - 1].jobId, 'job-1');
});

test('an event without try-on enabled records enqueue_failed and queues nothing', async (t) => {
  const { db, patches, jobs } = setup(t);
  const { enqueueTryOnForSubmission } = await importModule('disabled');
  const outcome = await enqueueTryOnForSubmission(db, { ...BASE, eventPolicy: { _id: 'e', tryOn: { enabled: false } } });
  assert.deepEqual(outcome, { status: 'enqueue_failed', jobId: null, error: 'try_on_not_enabled_for_event' });
  assert.equal(jobs.length, 0);
  assert.equal(patches[0].status, 'enqueue_failed');
  assert.equal(patches[0].lastError, 'try_on_not_enabled_for_event');
});

test('a garment the event does not allow, and a missing source photo, are refused', async (t) => {
  const { db, jobs } = setup(t);
  const { enqueueTryOnForSubmission } = await importModule('refused');
  const notAllowed = await enqueueTryOnForSubmission(db, { ...BASE, request: { ...BASE.request, leatherSuitId: 'suit-2' } });
  assert.equal(notAllowed.error, 'leather_suit_not_allowed_for_event');
  const noSource = await enqueueTryOnForSubmission(db, { ...BASE, request: { ...BASE.request, sourceImageData: null } });
  assert.equal(noSource.error, 'try_on_source_image_data is required when try-on is requested');
  assert.equal(jobs.length, 0);
});
