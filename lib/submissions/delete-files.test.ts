import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { deleteSubmissionFiles, ownedUrls, type SubmissionFilesDeps } from './delete-files';

const STORE = 'abc123.public.blob.vercel-storage.com';
const own = (path: string) => `https://${STORE}/${path}`;
const db = {} as Db;

const original = own('originals/evt12345/photo-1.jpg');
const composite = own('submissions/final-1.png');

function submission(extra: Record<string, unknown> = {}) {
  return { _id: 'sub-1', imageUrl: composite, finalImageUrl: composite, originalImageUrl: original, ...extra };
}

function makeDeps(overrides: Partial<SubmissionFilesDeps> = {}) {
  const calls = { del: [] as string[][], images: [] as string[], lookups: 0 };
  const deps: SubmissionFilesDeps = {
    storeHost: STORE,
    del: async (urls) => void calls.del.push(urls),
    deleteImage: async (url) => (calls.images.push(url), true),
    referencedElsewhere: async () => (calls.lookups++, new Set<string>()),
    ...overrides,
  };
  return { deps, calls };
}

test('deletes the composite and the full-frame original once each, and the try-on source', async () => {
  const source = own('tryon/source-1.jpg');
  const { deps, calls } = makeDeps();

  const result = await deleteSubmissionFiles(db, submission({ tryOnRequest: { sourceImageUrl: source } }), deps);

  assert.deepEqual(calls.del, [[composite, original, source]]);
  assert.deepEqual(result.deleted, [composite, original, source]);
});

test('older submissions (original equals composite) delete that file once', async () => {
  const { deps, calls } = makeDeps();

  await deleteSubmissionFiles(db, submission({ originalImageUrl: composite }), deps);

  assert.deepEqual(calls.del, [[composite]]);
});

test('skips URLs outside this project store and does nothing when no token is configured', async () => {
  const foreign = submission({ imageUrl: 'https://i.ibb.co/x/y.jpg', finalImageUrl: 'https://other.public.blob.vercel-storage.com/z.jpg' });
  const a = makeDeps();
  await deleteSubmissionFiles(db, foreign, a.deps);
  assert.deepEqual(a.calls.del, [[original]]);

  const b = makeDeps({ storeHost: null });
  const result = await deleteSubmissionFiles(db, submission(), b.deps);
  assert.deepEqual(b.calls.del, []);
  assert.equal(b.calls.lookups, 0);
  assert.deepEqual(result.deleted, []);
});

test('keeps a file another submission still references', async () => {
  const { deps, calls } = makeDeps({ referencedElsewhere: async () => new Set([composite]) });

  const result = await deleteSubmissionFiles(db, submission(), deps);

  assert.deepEqual(calls.del, [[original]]);
  assert.deepEqual(result.keptShared, [composite]);
});

test('a failed file delete answers 502, names no URL, and leaves the imgbb mirror alone', async () => {
  const { deps, calls } = makeDeps({
    del: async () => {
      throw new Error('blob unavailable');
    },
  });

  const error = await deleteSubmissionFiles(db, submission({ deleteUrl: 'https://ibb.co/AbC/hash' }), deps).then(
    () => null,
    (e: unknown) => e
  );

  assert.ok(error instanceof Response);
  assert.equal(error.status, 502);
  assert.doesNotMatch(JSON.stringify(await error.json()), /blob\.vercel-storage/);
  assert.deepEqual(calls.images, []);
});

test('requests the imgbb delete link, counts a failure, and never blocks on it', async () => {
  const { deps, calls } = makeDeps({ deleteImage: async () => false });

  const result = await deleteSubmissionFiles(db, submission({ deleteUrl: 'https://ibb.co/AbC/hash' }), deps);

  assert.equal(result.imgbbRequested, 1);
  assert.equal(result.imgbbFailed, 1);
  assert.deepEqual(calls.del, [[composite, original]]);
});

test('only imgbb hosts are ever requested as delete links', () => {
  const { imgbbDeleteLinks } = ownedUrls({
    deleteUrl: 'http://169.254.169.254/latest/meta-data',
    tryOnRequest: { sourceDeleteUrl: 'https://ibb.co/AbC/hash' },
  });
  assert.deepEqual(imgbbDeleteLinks, ['https://ibb.co/AbC/hash']);
});

test('the private photo of a vetted photo that is still pending is deleted with the submission', () => {
  const { fileUrls } = ownedUrls({ photoReview: { photoUrl: 'https://store.test/pending/e1/abc-xyz.jpg' } });
  assert.deepEqual(fileUrls, ['https://store.test/pending/e1/abc-xyz.jpg']);
  assert.deepEqual(ownedUrls({ photoReview: { photoUrl: null } }).fileUrls, [], 'after approval the file is gone and the field is null');
});

test('the screen-sized picture is deleted with the submission, once even when it is the photo itself', () => {
  const own = ownedUrls({ imageUrl: 'https://store.test/a.jpg', screenImageUrl: 'https://store.test/screen-pictures/1.webp' });
  assert.deepEqual(own.fileUrls, ['https://store.test/a.jpg', 'https://store.test/screen-pictures/1.webp']);
  assert.deepEqual(ownedUrls({ imageUrl: 'https://store.test/a.jpg', screenImageUrl: 'https://store.test/a.jpg' }).fileUrls, ['https://store.test/a.jpg']);
});
