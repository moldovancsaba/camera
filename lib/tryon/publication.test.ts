import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDerivedTryOnSubmission } from './publication';

const FULL_FRAME = 'https://store.public.blob.vercel-storage.com/originals/event-0001-abcd/full.jpg';
const COMPOSITE = 'https://store.public.blob.vercel-storage.com/composite.jpg';
const TRYON_SOURCE = 'https://store.public.blob.vercel-storage.com/tryon-source.jpg';
const RESULT = 'https://store.public.blob.vercel-storage.com/result.jpg';

function build(sourceExtra: Record<string, unknown>) {
  const sourceSubmission = {
    _id: { toString: () => 'abc123' },
    submissionId: 'submission_1',
    userId: 'user-1',
    userEmail: 'fan@example.com',
    userName: 'Fan',
    frameId: null,
    eventIds: ['event-0001-abcd'],
    imageUrl: COMPOSITE,
    finalImageUrl: COMPOSITE,
    originalImageUrl: COMPOSITE,
    metadata: { originalWidth: 1080, originalHeight: 1920 },
    consents: [],
    ...sourceExtra,
  };
  const job = {
    jobId: 'job_1',
    pipeline: 'motogp_leather_magic',
    pipelineVersion: 'v1',
    source: { app: 'camera', submissionId: 'submission_1', imageUrl: TRYON_SOURCE },
    request: { leatherSuitId: 'suit-1' },
  };
  return buildDerivedTryOnSubmission({ sourceSubmission: sourceSubmission as never, job: job as never, publicResultUrl: RESULT });
}

test('an older source keeps its original, as before', () => {
  assert.equal(build({}).originalImageUrl, COMPOSITE);
});

test('a source with a private full-frame original is not copied onto the derived result; the try-on source is used', () => {
  const derived = build({ originalImageUrl: FULL_FRAME, reframe: { version: 1 } });
  assert.equal(derived.originalImageUrl, TRYON_SOURCE);
  assert.equal(JSON.stringify(derived).includes(FULL_FRAME), false, 'the private URL appears nowhere in the derived document');
  assert.equal(derived.finalImageUrl, RESULT);
});
