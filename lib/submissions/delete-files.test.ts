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

test('the private photo of a vetted photo is deleted with the submission, pending or approved (since issue 509 approval keeps it until its ImgBB copy is verified)', () => {
  const { fileUrls } = ownedUrls({ photoReview: { photoUrl: 'https://store.test/pending/e1/abc-xyz.jpg' }, reviewStatus: 'approved' });
  assert.deepEqual(fileUrls, ['https://store.test/pending/e1/abc-xyz.jpg']);
  assert.deepEqual(ownedUrls({ photoReview: { photoUrl: null } }).fileUrls, [], 'a photo whose crop was deleted (or approved before issue 509) has no file and a null field');
});

const PENDING = own('pending/e1/abc-xyz.jpg');
const RESCUE = own('rescue/e1/sub-1.jpg');
const IBB_UNFRAMED = 'https://i.ibb.co/aaa/unframed.jpg';
const IBB_COMPOSED = 'https://i.ibb.co/bbb/composed.jpg';
const copies = [
  { role: 'unframed', store: 'blob', state: 'verified', url: PENDING, deleteUrl: null },
  { role: 'unframed', store: 'imgbb', state: 'verified', url: IBB_UNFRAMED, deleteUrl: 'https://ibb.co/aaa/hash-unframed' },
  { role: 'composed', store: 'blob', state: 'verified', url: composite },
  { role: 'composed', store: 'imgbb', state: 'verified', url: IBB_COMPOSED, deleteUrl: 'https://ibb.co/bbb/hash-composed' },
  { role: 'composed', store: 'blob', state: 'failed', url: RESCUE, deleteUrl: null },
  { role: 'unframed', store: 'imgbb', state: 'failed', url: null, deleteUrl: null },
];

test('every recorded copy is deleted with the submission: the Blob files with the Blob files, the imgbb files through their stored delete links', async () => {
  const { deps, calls } = makeDeps();
  const result = await deleteSubmissionFiles(db, submission({ photoReview: { photoUrl: PENDING }, imageCopies: copies }), deps);
  assert.deepEqual(calls.del, [[composite, original, PENDING, RESCUE]], 'the pending crop, the framed picture and a rescue copy go once each');
  assert.deepEqual(calls.images, ['https://ibb.co/aaa/hash-unframed', 'https://ibb.co/bbb/hash-composed']);
  assert.deepEqual([result.imgbbRequested, result.imgbbFailed, result.imgbbNotDeleted], [2, 0, []]);
});

test('a recorded imgbb copy whose delete failed is never silent: counted, listed by its public address (never its delete link) and the submission is still deleted', async () => {
  const { deps } = makeDeps({ deleteImage: async (url) => url !== 'https://ibb.co/aaa/hash-unframed' });
  const result = await deleteSubmissionFiles(db, submission({ imageCopies: copies }), deps);
  assert.equal(result.imgbbFailed, 1);
  assert.deepEqual(result.imgbbNotDeleted, [IBB_UNFRAMED]);
  assert.doesNotMatch(JSON.stringify(result), /hash-unframed/, 'the delete link is a secret and is not reported');
});

test('a Blob file that a failed copy names is deleted too, and a copy with no address or delete link adds nothing', () => {
  const own = ownedUrls({ imageCopies: [{ role: 'unframed', store: 'imgbb', state: 'failed', url: null, deleteUrl: null }, { role: 'composed', store: 'blob', state: 'failed', url: RESCUE }] });
  assert.deepEqual(own, { fileUrls: [RESCUE], imgbbDeleteLinks: [] });
  assert.deepEqual(ownedUrls({ imageCopies: 'broken' as never }), { fileUrls: [], imgbbDeleteLinks: [] });
});

test('the screen-sized picture is deleted with the submission, once even when it is the photo itself', () => {
  const own = ownedUrls({ imageUrl: 'https://store.test/a.jpg', screenImageUrl: 'https://store.test/screen-pictures/1.webp' });
  assert.deepEqual(own.fileUrls, ['https://store.test/a.jpg', 'https://store.test/screen-pictures/1.webp']);
  assert.deepEqual(ownedUrls({ imageUrl: 'https://store.test/a.jpg', screenImageUrl: 'https://store.test/a.jpg' }).fileUrls, ['https://store.test/a.jpg']);
});

test('a Blob copy already recorded as deleted (the crop, after its ImgBB copy was verified) is done: it is not asked for again, and the ImgBB copy of the crop is still deleted through its link', async () => {
  const deletedCopies = [
    { role: 'unframed', store: 'blob', state: 'deleted', url: PENDING, deleteUrl: null, deletedAt: '2026-10-12T10:00:00.000Z' },
    { role: 'unframed', store: 'imgbb', state: 'verified', url: IBB_UNFRAMED, deleteUrl: 'https://ibb.co/aaa/hash-unframed' },
    { role: 'composed', store: 'blob', state: 'verified', url: composite },
    { role: 'composed', store: 'imgbb', state: 'verified', url: IBB_COMPOSED, deleteUrl: 'https://ibb.co/bbb/hash-composed' },
  ];
  const { deps, calls } = makeDeps();
  const result = await deleteSubmissionFiles(db, submission({ photoReview: { photoUrl: null }, imageCopies: deletedCopies }), deps);
  assert.deepEqual(calls.del, [[composite, original]], 'the deleted crop is not requested again');
  assert.deepEqual(calls.images, ['https://ibb.co/aaa/hash-unframed', 'https://ibb.co/bbb/hash-composed']);
  assert.deepEqual([result.imgbbRequested, result.imgbbFailed, result.imgbbNotDeleted], [2, 0, []]);
  assert.deepEqual(ownedUrls({ imageCopies: deletedCopies }).fileUrls, [IBB_UNFRAMED, composite, IBB_COMPOSED], 'the deleted crop is not among the files');
});
