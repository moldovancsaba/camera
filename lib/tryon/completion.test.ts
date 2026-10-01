import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { WithId } from 'mongodb';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import type { TryOnResultAsset } from '@/lib/tryon/frame-composition';
import { createFakeDb } from './sync.fake-db';

// WHAT: Re-applying a completed try-on job (applyCompletionFromJobResult and
//     a repeated completion webhook) against an in-memory Mongo, with the
//     image work (frame composite, inspection), the publication-link upsert
//     and the email dispatch replaced by recorders.
// WHY: The re-application starts from the stored raw worker output so a frame
//     is never stacked on a frame (CAM-02). These tests pin the other half:
//     when no frame gets composed on that run, the approved, share-visible
//     framed result must stay as it is instead of being replaced by the raw,
//     unframed image.

const JOB_ID = 'job_20260911182715_abcd1234';
const SOURCE_ID = '650000000000000000000001';
const DERIVED_ID = '650000000000000000000002';
const JOB_MONGO_ID = '650000000000000000000009';
const RAW = 'https://example.public.blob.vercel-storage.com/tryon-result-raw.png';
const FRAMED = 'https://i.ibb.co/abc123/tryon-framed-1.png';
const FRAMED_PREVIEW = 'https://i.ibb.co/abc123/tryon-framed-1-preview.jpg';
const FRAMED_DELETE = 'https://i.ibb.co/abc123/framed-1-delete';
const NEW_FRAMED = 'https://i.ibb.co/def456/tryon-framed-2.png';
const FRAME_URL = 'https://example.public.blob.vercel-storage.com/frame-1.png';

let composeFails = false;
const composedFrom: string[] = [];
const inspected: string[] = [];
const publicationLinks: string[] = [];

const publicationReal = await import('@/lib/tryon/publication');
mock.module('@/lib/tryon/frame-composition', {
  namedExports: {
    applyFrameToTryOnResult: async (resultUrl: string): Promise<TryOnResultAsset> => {
      composedFrom.push(resultUrl);
      if (composeFails) {
        throw new Error('Failed to fetch image asset: 503 Service Unavailable');
      }
      return {
        publicResultUrl: NEW_FRAMED,
        previewUrl: 'https://i.ibb.co/def456/tryon-framed-2-preview.jpg',
        deleteUrl: 'https://i.ibb.co/def456/framed-2-delete',
        fileSize: 2000,
        mimeType: 'image/png',
        width: 1080,
        height: 1350,
        compositionEngine: 'motogp_leather_magic_framed',
      };
    },
    inspectTryOnResultAsset: async (url: string): Promise<TryOnResultAsset> => {
      inspected.push(url);
      return {
        publicResultUrl: url,
        previewUrl: null,
        deleteUrl: null,
        fileSize: null,
        mimeType: null,
        width: null,
        height: null,
        compositionEngine: 'motogp_leather_magic',
      };
    },
  },
});
mock.module('@/lib/tryon/publication', {
  namedExports: {
    ...publicationReal,
    upsertSubmissionTryOnPublicationLink: async (_db: unknown, _id: unknown, summary: { resultUrl: string }) => {
      publicationLinks.push(summary.resultUrl);
    },
  },
});
mock.module('@/lib/email/submission-result-email', {
  namedExports: { dispatchPendingRelatedEmailForSubmission: async () => null },
});

const { applyCompletionFromJobResult, applyTryOnCompletion } = await import('./completion');

function buildJob(): WithId<TryOnJob> {
  return {
    _id: JOB_MONGO_ID,
    jobId: JOB_ID,
    requestHash: 'hash-1',
    status: 'done',
    stage: 'done',
    pipeline: 'motogp_leather_magic',
    pipelineVersion: '1.1.0',
    request: { leatherSuitId: 'motogp_honda_castrol_2026_v1' },
    source: { submissionId: SOURCE_ID, imageUrl: 'https://example.public.blob.vercel-storage.com/source.jpg' },
    // After the first completion the job points at the framed composite.
    result: { publicResultUrl: FRAMED, imgbbDeleteUrl: FRAMED_DELETE, provider: 'imgbb' },
    updatedAt: '2026-09-11T18:28:20.000Z',
  } as unknown as WithId<TryOnJob>;
}

function derivedFramedResult() {
  return {
    _id: DERIVED_ID,
    submissionKind: 'tryon_result',
    sourceSubmissionId: SOURCE_ID,
    sourceJobId: JOB_ID,
    imageUrl: FRAMED,
    finalImageUrl: FRAMED,
    previewImageUrl: FRAMED_PREVIEW,
    deleteUrl: FRAMED_DELETE,
    fileSize: 1000,
    mimeType: 'image/png',
    reviewStatus: 'approved',
    isShareVisible: true,
    isSlideshowEligible: true,
    metadata: {
      compositionEngine: 'motogp_leather_magic_framed',
      tryOnRawResultUrl: RAW,
      finalWidth: 1080,
      finalHeight: 1350,
    },
  };
}

interface StoredResult {
  imageUrl?: string;
  finalImageUrl?: string;
  previewImageUrl?: string | null;
  deleteUrl?: string | null;
  reviewStatus?: string;
  isShareVisible?: boolean;
  isSlideshowEligible?: boolean;
  metadata: { compositionEngine?: string; tryOnRawResultUrl?: string | null };
}

type FakeDb = ReturnType<typeof createFakeDb>;

function storedResult(fake: FakeDb, match: (doc: Record<string, unknown>) => boolean): StoredResult {
  return fake.docs(COLLECTIONS.SUBMISSIONS).find(match) as unknown as StoredResult;
}

function storedJobResultUrl(fake: FakeDb): string {
  return (fake.docs(COLLECTIONS.TRYON_JOBS)[0] as unknown as { result: { publicResultUrl: string } }).result.publicResultUrl;
}

function storedSourceResultUrl(fake: FakeDb): string | null {
  const source = fake.docs(COLLECTIONS.SUBMISSIONS).find((doc) => doc._id === SOURCE_ID);
  return (source as unknown as { tryOnRequest: { resultUrl: string | null } }).tryOnRequest.resultUrl;
}

function setup(options: { frameRecord?: boolean; applyFrame?: boolean; derived?: boolean; failCompose?: boolean; autoApprove?: boolean } = {}) {
  const { frameRecord = true, applyFrame = true, derived = true, failCompose = false, autoApprove = false } = options;
  composeFails = failCompose;
  composedFrom.length = 0;
  inspected.length = 0;
  publicationLinks.length = 0;

  return createFakeDb({
    [COLLECTIONS.EVENTS]: [
      { _id: '650000000000000000000010', eventId: 'evt-1', tryOn: { applyFrameToReturnedResults: applyFrame, vettingEnabled: !autoApprove } },
    ],
    [COLLECTIONS.FRAMES]: frameRecord ? [{ frameId: 'frame-1', imageUrl: FRAME_URL }] : [],
    [COLLECTIONS.SUBMISSIONS]: [
      { _id: SOURCE_ID, eventId: 'evt-1', frameId: 'frame-1', userName: 'Guest', userEmail: '' },
      ...(derived ? [derivedFramedResult()] : []),
    ],
    [COLLECTIONS.TRYON_JOBS]: [structuredClone(buildJob())],
  });
}

function assertFramedResultKept(fake: FakeDb) {
  const derived = storedResult(fake, (doc) => doc._id === DERIVED_ID);
  assert.equal(derived.imageUrl, FRAMED);
  assert.equal(derived.finalImageUrl, FRAMED);
  assert.equal(derived.previewImageUrl, FRAMED_PREVIEW);
  assert.equal(derived.deleteUrl, FRAMED_DELETE);
  assert.equal(derived.metadata.compositionEngine, 'motogp_leather_magic_framed');
  assert.equal(derived.metadata.tryOnRawResultUrl, RAW);
  assert.equal(derived.reviewStatus, 'approved');
  assert.equal(derived.isShareVisible, true);

  assert.equal(storedJobResultUrl(fake), FRAMED);
  assert.equal(storedSourceResultUrl(fake), FRAMED);
  assert.deepEqual(publicationLinks, [FRAMED]);
  // Nothing about the published image was re-inspected or re-uploaded.
  assert.deepEqual(inspected, []);
}

test('reapply composes the frame onto the stored raw output, never onto the framed composite', async () => {
  const fake = setup();

  const outcome = await applyCompletionFromJobResult(fake.db, buildJob());

  assert.deepEqual(composedFrom, [RAW]);
  assert.equal(outcome.action, 'updated');
  const derived = storedResult(fake, (doc) => doc._id === DERIVED_ID);
  assert.equal(derived.imageUrl, NEW_FRAMED);
  assert.equal(derived.metadata.tryOnRawResultUrl, RAW);
  assert.equal(derived.isShareVisible, true);
  assert.equal(storedJobResultUrl(fake), NEW_FRAMED);
});

test('reapply after the frame record was deleted keeps the framed result instead of publishing the raw one', async () => {
  const fake = setup({ frameRecord: false });

  const outcome = await applyCompletionFromJobResult(fake.db, buildJob());

  assert.equal(outcome.action, 'unchanged');
  assert.equal(outcome.publicationVisible, true);
  assert.deepEqual(composedFrom, []);
  assertFramedResultKept(fake);
});

test('reapply while the frame composite throws keeps the framed result and logs it', async (t) => {
  const fake = setup({ failCompose: true });
  const errors = t.mock.method(console, 'error', () => {});

  const outcome = await applyCompletionFromJobResult(fake.db, buildJob());

  assert.equal(outcome.action, 'unchanged');
  assert.deepEqual(composedFrom, [RAW]);
  assertFramedResultKept(fake);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /keeping the current framed result/);
});

test('reapply with applyFrameToReturnedResults switched off keeps the framed result', async () => {
  const fake = setup({ applyFrame: false });

  const outcome = await applyCompletionFromJobResult(fake.db, buildJob());

  assert.equal(outcome.action, 'unchanged');
  assert.deepEqual(composedFrom, []);
  assertFramedResultKept(fake);
});

test('a repeated completion webhook for the same raw output keeps the framed result when the composite throws', async (t) => {
  const fake = setup({ failCompose: true });
  t.mock.method(console, 'error', () => {});

  const outcome = await applyTryOnCompletion(fake.db, buildJob(), { publicResultUrl: RAW });

  assert.equal(outcome.action, 'unchanged');
  assertFramedResultKept(fake);
});

test('a first completion with a failing composite still publishes the raw result (nothing to keep yet)', async (t) => {
  const fake = setup({ derived: false, failCompose: true });
  const errors = t.mock.method(console, 'error', () => {});

  const outcome = await applyTryOnCompletion(fake.db, buildJob(), { publicResultUrl: RAW });

  assert.equal(outcome.action, 'created');
  assert.deepEqual(inspected, [RAW]);
  const created = storedResult(fake, (doc) => doc.sourceJobId === JOB_ID);
  assert.equal(created.imageUrl, RAW);
  assert.equal(created.reviewStatus, 'pending_review');
  assert.match(String(errors.mock.calls[0].arguments[0]), /falling back to raw upload/);
});

test('image.direct completion keeps a new result pending and hidden even when event auto-vetting is disabled', async () => {
  const fake = setup({ derived: false, applyFrame: false, autoApprove: true });

  const outcome = await applyTryOnCompletion(fake.db, buildJob(), {
    publicResultUrl: RAW,
    forcePendingReview: true,
  });

  const created = storedResult(fake, (doc) => doc.sourceJobId === JOB_ID);
  assert.equal(outcome.publicationStatus, 'pending_review');
  assert.equal(outcome.publicationVisible, false);
  assert.equal(created.reviewStatus, 'pending_review');
  assert.equal(created.isShareVisible, false);
  assert.equal(created.isSlideshowEligible, false);
});
