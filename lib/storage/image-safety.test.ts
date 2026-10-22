import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import type { ImageCopy } from '@/lib/db/schemas';
import { fakeDb } from '@/lib/library/fake-db';
import type { MirrorResult } from '@/lib/imgbb/upload';
import { classify, needs, planImageSafety, probeImageSafety, runImageSafetyBatch, type SafetyDeps } from './image-safety';

const STORE = 'abc123.public.blob.vercel-storage.com';
const blob = (path: string) => `https://${STORE}/${path}`;
const ibb = (path: string) => `https://i.ibb.co/${path}`;
const AT = '2026-10-12T10:00:00.000Z';
const eligible = <T extends Doc>(doc: T): T & Doc => ({ consentStatus: 'received', consents: [{ pageId: 'accept', pageType: 'accept', checkboxText: 'Terms', accepted: true, required: true, acceptedAt: AT }], ...doc });

type Doc = Record<string, unknown>;
const copy = (role: ImageCopy['role'], store: ImageCopy['store'], state: ImageCopy['state'], url: string | null = `https://i.ibb.co/c/${role}.jpg`): ImageCopy => ({ role, store, state, url, bytes: 10, verifiedAt: state === 'verified' ? AT : null, recordedAt: AT });

const ids = Array.from({ length: 14 }, () => new ObjectId());
// Created in id order, so a walk by id meets them in this order.
const S = {
  imgbbOnly: { _id: ids[0], eventId: 'evt1', imageUrl: ibb('a/1.jpg'), finalImageUrl: ibb('a/1.jpg') },
  blobOnly: { _id: ids[1], eventId: 'evt1', imageUrl: blob('s2.jpg'), finalImageUrl: blob('s2.jpg') },
  blobOldMirror: { _id: ids[2], eventId: 'evt1', imageUrl: blob('s3.jpg'), deleteUrl: 'https://ibb.co/x/hash', imageId: 'x' },
  both: { _id: ids[3], eventId: 'evt1', imageUrl: blob('s4.jpg'), imageCopies: [copy('composed', 'imgbb', 'verified')] },
  other: { _id: ids[4], eventId: 'evt1', imageUrl: 'https://example.com/x.jpg' },
  waiting: { _id: ids[5], eventId: 'evt1', reviewStatus: 'pending_review', photoReview: { photoUrl: blob('pending/e/w.jpg') } },
  // Approved, the crop still in our store, the ImgBB copy of it was not made.
  blobCrop: { _id: ids[6], eventId: 'evt1', reviewStatus: 'approved', imageUrl: blob('s7.jpg'), photoReview: { photoUrl: blob('pending/e/o.jpg') }, imageCopies: [copy('composed', 'imgbb', 'verified'), copy('unframed', 'imgbb', 'failed', null)] },
  // Approved, the crop in our store and a verified copy on ImgBB: the delete is still to do.
  cropBoth: { _id: ids[7], eventId: 'evt1', reviewStatus: 'approved', imageUrl: blob('s8.jpg'), photoReview: { photoUrl: blob('pending/e/t.jpg') }, imageCopies: [copy('composed', 'imgbb', 'verified'), copy('unframed', 'imgbb', 'verified')] },
  tryOn: { _id: ids[8], eventId: 'evt1', submissionKind: 'tryon_result', imageUrl: blob('tryon.jpg') },
  rejected: { _id: ids[9], eventId: 'evt1', reviewStatus: 'rejected', photoReview: { photoUrl: blob('pending/e/r.jpg') } },
  unverified: { _id: ids[10], eventId: 'evt1', imageUrl: blob('s11.jpg'), imageCopies: [copy('composed', 'imgbb', 'unverified')] },
  // Historical fixture: a Blob crop was deleted after the ImgBB copy was verified.
  imgbbFinal: { _id: ids[11], eventId: 'evt1', reviewStatus: 'approved', imageUrl: blob('s12.jpg'), photoReview: { photoUrl: null }, imageCopies: [copy('composed', 'imgbb', 'verified'), { ...copy('unframed', 'blob', 'deleted', blob('pending/e/gone.jpg')), deletedAt: AT }, copy('unframed', 'imgbb', 'verified')] },
  // ImgBB answered with another size: nothing was deleted, the crop stays in our store.
  keptUnverified: { _id: ids[12], eventId: 'evt1', reviewStatus: 'approved', imageUrl: blob('s13.jpg'), photoReview: { photoUrl: blob('pending/e/k.jpg') }, imageCopies: [copy('composed', 'imgbb', 'verified'), { ...copy('unframed', 'imgbb', 'failed'), error: 'wrong size: 10 bytes were written, the host reports 17' }] },
};

test('where a photo is held comes from its stored address and its verified copies; a copy that is not verified does not count', () => {
  assert.equal(classify(S.imgbbOnly).composed, 'imgbb-only');
  assert.equal(classify(S.blobOnly).composed, 'blob-only');
  assert.deepEqual([classify(S.blobOldMirror).composed, classify(S.blobOldMirror).oldMirrorRecord, classify(S.blobOnly).oldMirrorRecord], ['blob-only', true, false]);
  assert.equal(classify(S.both).composed, 'both');
  assert.equal(classify(S.other).composed, 'other');
  assert.equal(classify(S.waiting).composed, 'none');
  assert.equal(classify(S.unverified).composed, 'blob-only', 'an unverified ImgBB copy is not a second copy');
  assert.deepEqual([S.waiting, S.blobCrop, S.cropBoth, S.imgbbFinal, S.rejected, S.blobOnly].map((doc) => classify(doc).unframed), ['waiting', 'blob-only', 'both', 'imgbb-only', 'rejected', 'none']);
  assert.deepEqual([classify(S.blobCrop).notMade, classify(S.blobCrop).couldNotVerify, classify(S.unverified).couldNotVerify, classify(S.keptUnverified).couldNotVerify, classify(S.keptUnverified).notMade], [1, 0, 1, 1, 0]);
  assert.deepEqual([classify(S.keptUnverified).cropKeptUnverified, classify(S.blobCrop).cropKeptUnverified, classify(S.imgbbFinal).cropKeptUnverified], [true, false, false]);
  assert.deepEqual([needs('rescue', S.imgbbOnly), needs('mirror', S.imgbbOnly), needs('mirror', S.blobOnly), needs('unframed', S.blobCrop), needs('unframed', S.cropBoth), needs('unframed', S.imgbbFinal), needs('unframed-rescue', S.imgbbFinal), needs('unframed', S.waiting)], [true, false, true, true, false, false, true, false]);
});

test('the count (dry run) groups every photo, the unframed crops (our store only, ImgBB only, both), the crops kept because their copy could not be verified, the copies not made or not verified, leaves a try-on result out, and writes nothing', async () => {
  const { db, calls } = fakeDb({ submissions: Object.values(S).map(eligible) });
  const plan = await planImageSafety(db);
  assert.deepEqual(plan, {
    pictures: 10,
    tryOnResults: 1,
    consentExcluded: 0,
    composed: { imgbbOnly: 1, blobOnly: 3, blobOnlyOldMirror: 1, both: 5, other: 1 },
    unframed: { blobOnly: 2, imgbbOnly: 1, both: 1, waiting: 1, rejected: 1, keptUnverified: 1 },
    copies: { notMade: 1, couldNotVerify: 2, photosWithAProblem: 3 },
    toDo: { rescue: 1, mirror: 3, unframed: 2, 'unframed-rescue': 1 },
  });
  assert.deepEqual(calls.filter((call) => call.op !== 'find'), [], 'no write of any kind');
});

// ---- the run ------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function jpeg(width = 64, height = 40) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 20, b: 20 } } }).jpeg().toBuffer();
}

/** A copy of a seed that shares nothing with it (the in-memory database copies a document one level deep, and a run changes nested fields). ObjectIds are kept as they are. */
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  return value;
}

async function setup(seed: Doc[], options: { source?: Record<string, Buffer | Error>; imgbb?: 'works' | 'fails' | 'wrong-size'; blobFiles?: Record<string, number>; budgetMs?: number } = {}) {
  const fx = fakeDb({ submissions: clone(seed.map(eligible)) });
  const picture = await jpeg();
  const source = options.source ?? {};
  const hostFiles: Record<string, number> = { ...(options.blobFiles ?? {}) };
  const downloads: string[] = [];
  const writes: Array<{ path: string; bytes: number; type: string }> = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  const deps: SafetyDeps = {
    fetch: (async (input: unknown) => {
      const size = hostFiles[String(input)];
      return size === undefined ? new Response(null, { status: 404 }) : new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': `bytes 0-0/${size}` } });
    }) as typeof fetch,
    uploadToImgbb: async (base64, name) => {
      uploads.push(name);
      if (options.imgbb === 'fails') throw new Error('imgbb answered 500');
      const result: MirrorResult = { imageUrl: ibb(`new/${name}.jpg`), deleteUrl: `https://ibb.co/new/${name}`, imageId: name };
      hostFiles[result.imageUrl] = Buffer.from(base64, 'base64').length + (options.imgbb === 'wrong-size' ? 7 : 0);
      return result;
    },
    deleteFromImgbb: async (link) => (deleted.push(link), true),
    now: () => AT,
    readBackAttempts: 1,
    readBackDelayMs: 0,
    probeTimeoutMs: 1000,
    imgbbTimeoutMs: 1000,
    mirrorWaitMs: 1000,
    budgetMs: options.budgetMs ?? 30_000,
    downloadMs: 1000,
    fetchPicture: async (url) => {
      downloads.push(url);
      const found = source[url] ?? picture;
      if (found instanceof Error) throw found;
      hostFiles[url] ??= found.length;
      return found;
    },
    putBlob: async (path, body, type) => {
      writes.push({ path, bytes: body.length, type });
      const url = blob(path);
      hostFiles[url] = body.length;
      return { url };
    },
  };
  const row = (id: ObjectId) => fx.data.submissions.find((doc) => String(doc._id) === String(id)) as Doc;
  const copies = (id: ObjectId) => (row(id).imageCopies as ImageCopy[] | undefined) ?? [];
  const state = (id: ObjectId, role: string, store: string) => copies(id).find((c) => c.role === role && c.store === store)?.state;
  return { ...fx, deps, writes, uploads, deleted, downloads, picture, row, copies, state, hostFiles };
}

test('rescue copies a picture that is only on ImgBB into our store, verified, without changing the stored address, and deletes nothing', async () => {
  const t = await setup([S.imgbbOnly, S.blobOnly]);
  const result = await runImageSafetyBatch(t.db, { kind: 'rescue' }, t.deps);
  assert.deepEqual([result.processed, result.counts, result.failures, result.next], [1, { copied: 1, failed: 0 }, [], null]);
  assert.deepEqual(t.writes.map((w) => [w.path, w.type]), [[`rescue/evt1/${String(ids[0])}.jpg`, 'image/jpeg']]);
  assert.equal(t.state(ids[0], 'composed', 'blob'), 'verified');
  assert.equal(t.state(ids[0], 'composed', 'imgbb'), 'verified');
  assert.equal(t.copies(ids[0]).find((c) => c.store === 'blob')?.url, blob(`rescue/evt1/${String(ids[0])}.jpg`));
  assert.equal(t.row(ids[0]).imageUrl, ibb('a/1.jpg'), 'the stored picture address is not changed');
  assert.equal(t.row(ids[0]).finalImageUrl, ibb('a/1.jpg'));
  assert.deepEqual(t.deleted, []);
  assert.equal(t.calls.some((call) => call.op === 'deleteOne' || call.op === 'deleteMany'), false);
  assert.equal(classify(t.row(ids[0])).composed, 'both');
  // A repeat does only what is missing: nothing.
  const again = await runImageSafetyBatch(t.db, { kind: 'rescue' }, t.deps);
  assert.deepEqual([again.processed, again.counts.copied], [0, 0]);
  assert.equal(t.writes.length, 1);
});

test('rescue reports the reason when the source is gone, is not a picture or is the host\'s stand-in, records it, and goes on with the next photo', async () => {
  const gone = eligible({ _id: ids[0], eventId: 'evt1', imageUrl: ibb('a/gone.jpg') });
  const standIn = eligible({ _id: ids[1], eventId: 'evt1', imageUrl: ibb('a/standin.png') });
  const text = eligible({ _id: ids[2], eventId: 'evt1', imageUrl: ibb('a/text.jpg') });
  const fine = eligible({ _id: ids[3], eventId: 'evt1', imageUrl: ibb('a/fine.jpg') });
  const placeholder = await sharp({ create: { width: 180, height: 180, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const t = await setup([gone, standIn, text, fine], { source: { [ibb('a/gone.jpg')]: new Error('Failed to fetch image asset: 404 Not Found'), [ibb('a/standin.png')]: placeholder, [ibb('a/text.jpg')]: Buffer.from('<html>nope</html>') } });
  const result = await runImageSafetyBatch(t.db, { kind: 'rescue' }, t.deps);
  assert.deepEqual([result.processed, result.counts], [4, { copied: 1, failed: 3 }]);
  const reasons = Object.fromEntries(result.failures.map((f) => [f.id, f.reason]));
  assert.match(reasons[String(ids[0])], /could not be read from ImgBB: Failed to fetch image asset: 404/);
  assert.match(reasons[String(ids[1])], /"image not found" picture/);
  assert.match(reasons[String(ids[2])], /not a picture/);
  assert.equal(t.state(ids[0], 'composed', 'blob'), 'failed');
  assert.match(t.copies(ids[0])[0].error ?? '', /404/);
  assert.equal(t.state(ids[3], 'composed', 'blob'), 'verified');
  assert.equal(t.writes.length, 1, 'only the good one was written');
  // The failed ones are still to do; a later run tries them again.
  assert.equal((await planImageSafety(t.db)).toDo.rescue, 3);
});

test('mirror copies a picture that is only on Blob to ImgBB, verified, with its address and delete link, and the photo is then held on both', async () => {
  const t = await setup([S.blobOnly, S.blobOldMirror, S.both]);
  const result = await runImageSafetyBatch(t.db, { kind: 'mirror' }, t.deps);
  assert.deepEqual([result.processed, result.counts.copied, result.counts.failed], [2, 2, 0]);
  assert.equal(t.uploads.length, 2);
  const mirrored = t.copies(ids[1]).find((c) => c.store === 'imgbb');
  assert.equal(mirrored?.state, 'verified');
  assert.match(mirrored?.url ?? '', /^https:\/\/i\.ibb\.co\/new\//);
  assert.match(mirrored?.deleteUrl ?? '', /^https:\/\/ibb\.co\/new\//);
  assert.equal(t.state(ids[1], 'composed', 'blob'), 'verified');
  assert.equal(classify(t.row(ids[1])).composed, 'both');
  assert.equal(t.row(ids[1]).imageUrl, blob('s2.jpg'));
  assert.equal(t.row(ids[2]).deleteUrl, 'https://ibb.co/x/hash', 'the old mirror record is left as it is');
  assert.equal(t.writes.length, 0, 'nothing is written to our store');
});

test('mirror when ImgBB fails: reported with the reason, recorded as failed, the photo is still to do and nothing else is harmed', async () => {
  const t = await setup([S.blobOnly], { imgbb: 'fails' });
  const result = await runImageSafetyBatch(t.db, { kind: 'mirror' }, t.deps);
  assert.deepEqual(result.counts, { copied: 0, failed: 1 });
  assert.match(result.failures[0].reason, /upload to imgbb failed: imgbb answered 500/);
  assert.equal(t.state(ids[1], 'composed', 'imgbb'), 'failed');
  assert.equal(t.row(ids[1]).imageUrl, blob('s2.jpg'));
  assert.equal((await planImageSafety(t.db)).toDo.mirror, 1);
});

test('unframed mirrors an approved crop and keeps its Blob source and address; already mirrored crops are left alone', async () => {
  const cropBothUrl = blob('pending/e/t.jpg');
  const t = await setup([S.waiting, S.blobCrop, S.cropBoth, S.rejected], { blobFiles: { [cropBothUrl]: 10 } });
  const result = await runImageSafetyBatch(t.db, { kind: 'unframed' }, t.deps);
  assert.deepEqual([result.processed, result.counts.copied, result.counts.failed], [1, 1, 0]);
  assert.deepEqual(t.uploads, [`unframed-${String(ids[6])}`], 'only the crop without a verified ImgBB copy is uploaded');
  assert.deepEqual(t.downloads, [blob('pending/e/o.jpg')]);
  assert.equal(t.state(ids[6], 'unframed', 'imgbb'), 'verified');
  assert.equal(t.state(ids[6], 'unframed', 'blob'), 'verified');
  assert.equal((t.row(ids[6]).photoReview as Doc).photoUrl, blob('pending/e/o.jpg'));
  assert.equal(classify(t.row(ids[6])).unframed, 'both');
  assert.equal(t.state(ids[7], 'unframed', 'blob'), undefined, 'a crop already verified in both places is not touched');
  assert.equal((t.row(ids[7]).photoReview as Doc).photoUrl, cropBothUrl);
  for (const id of [ids[5], ids[9]]) assert.deepEqual([t.row(id).imageCopies, (t.row(id).photoReview as Doc).photoUrl !== null], [undefined, true]);
  assert.equal(JSON.stringify(result).includes('pending/'), false);
  assert.equal((await runImageSafetyBatch(t.db, { kind: 'unframed' }, t.deps)).processed, 0);
});

test('unframed with an ImgBB copy that fails, or has another size, keeps the private Blob crop, reports the reason, and the plan shows the crop as kept because its copy could not be verified', async () => {
  const failing = await setup([S.blobCrop], { imgbb: 'fails' });
  const failed = await runImageSafetyBatch(failing.db, { kind: 'unframed' }, failing.deps);
  assert.deepEqual([failed.counts.copied, failed.counts.failed], [0, 1]);
  assert.match(failed.failures[0].reason, /upload to imgbb failed: imgbb answered 500/);
  assert.equal((failing.row(ids[6]).photoReview as Doc).photoUrl, blob('pending/e/o.jpg'));
  assert.equal(failing.state(ids[6], 'unframed', 'blob'), 'verified');

  const changed = await setup([S.blobCrop], { imgbb: 'wrong-size' });
  const wrong = await runImageSafetyBatch(changed.db, { kind: 'unframed' }, changed.deps);
  assert.deepEqual([wrong.counts.copied, wrong.counts.failed], [0, 1]);
  assert.match(wrong.failures[0].reason, /wrong size/);
  assert.equal(changed.state(ids[6], 'unframed', 'imgbb'), 'failed');
  const plan = await planImageSafety(changed.db);
  assert.deepEqual([plan.unframed.keptUnverified, plan.unframed.blobOnly, plan.copies.couldNotVerify], [1, 1, 1], 'the case is its own count in the dry run');
  assert.equal(plan.toDo.unframed, 1, 'and a later run tries it again');
});

test('a batch is bounded: at most `limit` photos, the cursor goes on from the last one, and every photo is worked on exactly once', async () => {
  const seed = Array.from({ length: 5 }, (_, i) => eligible({ _id: ids[i], eventId: 'evt1', imageUrl: ibb(`a/${i}.jpg`) }));
  const t = await setup(seed);
  const seen: string[] = [];
  let after: ObjectId | undefined;
  let calls = 0;
  for (;;) {
    const batch = await runImageSafetyBatch(t.db, { kind: 'rescue', limit: 2, after }, t.deps);
    calls += 1;
    assert.ok(batch.processed <= 2);
    seen.push(...t.writes.slice(seen.length).map((w) => w.path));
    if (!batch.next) break;
    after = new ObjectId(batch.next);
    assert.ok(calls < 10, 'the walk ends');
  }
  assert.equal(calls, 3);
  assert.equal(new Set(seen).size, 5);
  assert.equal(t.writes.length, 5);
  // The size asked for is capped.
  const capped = await setup(Array.from({ length: 12 }, (_, i) => ({ _id: ids[i], eventId: 'evt1', imageUrl: ibb(`b/${i}.jpg`) })));
  assert.equal((await runImageSafetyBatch(capped.db, { kind: 'rescue', limit: 500 }, capped.deps)).processed, 12);
});

test('a call stops starting new work when its time is used and says where to go on from', async () => {
  const seed = Array.from({ length: 9 }, (_, i) => eligible({ _id: ids[i], eventId: 'evt1', imageUrl: ibb(`c/${i}.jpg`) }));
  const t = await setup(seed, { budgetMs: -1 });
  const batch = await runImageSafetyBatch(t.db, { kind: 'rescue', limit: 12 }, t.deps);
  assert.equal(batch.processed, 3, 'one chunk of three is always done, so the walk makes progress');
  assert.equal(batch.next, String(ids[2]));
});

// ---- the address check (reads only) -----------------------------------------------------------------------------------------------------------------------------

test('the address check asks every address a photo names with a one-byte range request, lists the ones that are gone, never names the private crop, and writes nothing', async () => {
  const photo = eligible({ _id: ids[0], eventId: 'evt1', imageUrl: ibb('a/ok.jpg'), reviewStatus: 'approved', photoReview: { photoUrl: blob('pending/e/gone.jpg') }, imageCopies: [copy('composed', 'blob', 'verified', blob('rescue/evt1/x.jpg')), copy('unframed', 'imgbb', 'verified', ibb('u/gone.jpg'))] });
  const slow = eligible({ _id: ids[1], eventId: 'evt1', imageUrl: blob('slow.jpg') });
  const { db, calls } = fakeDb({ submissions: [photo, slow] });
  const asked: string[] = [];
  const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    asked.push(`${url} ${init?.headers?.Range}`);
    if (url === ibb('a/ok.jpg') || url === blob('rescue/evt1/x.jpg')) return new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-0/99' } });
    if (url === blob('slow.jpg')) return new Response(null, { status: 503 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const batch = await probeImageSafety(db, {}, fetchImpl);
  assert.deepEqual([batch.processed, batch.addresses, batch.ok, batch.gone, batch.unknown, batch.next], [2, 5, 2, 2, 1, null]);
  assert.ok(asked.every((line) => line.endsWith('bytes=0-0')));
  // Both gone addresses belong to the unframed crop (the private file and its ImgBB copy): they are named by photo, never by address.
  assert.deepEqual(batch.goneList.map((g) => [g.what, g.url]), [['unframed crop', null], ['unframed crop', null]]);
  assert.equal(JSON.stringify(batch).includes('u/gone.jpg'), false);
  assert.equal(JSON.stringify(batch).includes('pending/'), false);
  assert.deepEqual(calls.filter((call) => call.op !== 'find'), [], 'it writes nothing and marks nothing');
});

test('the address check is bounded and continues from a cursor', async () => {
  const seed = Array.from({ length: 5 }, (_, i) => eligible({ _id: ids[i], eventId: 'evt1', imageUrl: blob(`p${i}.jpg`) }));
  const { db } = fakeDb({ submissions: seed });
  const fetchImpl = (async () => new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-0/9' } })) as typeof fetch;
  const first = await probeImageSafety(db, { limit: 3 }, fetchImpl);
  assert.deepEqual([first.processed, first.next], [3, String(ids[2])]);
  const second = await probeImageSafety(db, { limit: 3, after: new ObjectId(first.next as string) }, fetchImpl);
  assert.deepEqual([second.processed, second.next], [2, null]);
});

test('a download that never ends is given up, reported with its reason and recorded, and the batch goes on', async () => {
  const slow = eligible({ _id: ids[0], eventId: 'evt1', imageUrl: ibb('a/slow.jpg') });
  const fine = eligible({ _id: ids[1], eventId: 'evt1', imageUrl: ibb('a/fine.jpg') });
  const t = await setup([slow, fine]);
  const never = { ...t.deps, downloadMs: 20, fetchPicture: async (url: string) => (url === ibb('a/slow.jpg') ? new Promise<Buffer>(() => undefined) : t.picture) };
  const result = await runImageSafetyBatch(t.db, { kind: 'rescue' }, never);
  assert.deepEqual(result.counts, { copied: 1, failed: 1 });
  assert.match(result.failures[0].reason, /the host did not send the file within 0\.02 s/);
  assert.equal(t.state(ids[0], 'composed', 'blob'), 'failed');
  assert.equal(t.state(ids[1], 'composed', 'blob'), 'verified');
});

test('a verified historical ImgBB crop is restored to Blob and reattached without deleting the ImgBB source', async () => {
  const t = await setup([S.imgbbFinal]);
  const result = await runImageSafetyBatch(t.db, { kind: 'unframed-rescue' }, t.deps);
  assert.deepEqual([result.processed, result.counts], [1, { copied: 1, failed: 0 }]);
  assert.deepEqual(t.writes.map((write) => write.path), [`pending/evt1/${String(ids[11])}.jpg`]);
  assert.equal(t.state(ids[11], 'unframed', 'blob'), 'verified');
  assert.equal(t.state(ids[11], 'unframed', 'imgbb'), 'verified');
  assert.equal((t.row(ids[11]).photoReview as Doc).photoUrl, blob(`pending/evt1/${String(ids[11])}.jpg`));
  assert.equal(classify(t.row(ids[11])).unframed, 'both');
  assert.deepEqual(t.deleted, [], 'the ImgBB source is kept');
});

test('photos without valid consent are neither probed nor copied', async () => {
  const noAudit = { ...eligible({ _id: ids[0], eventId: 'evt1', imageUrl: ibb('a/no-consent.jpg') }), consents: [] };
  const t = await setup([noAudit]);
  const plan = await planImageSafety(t.db);
  assert.deepEqual([plan.consentExcluded, plan.toDo.rescue], [1, 0]);
  const result = await runImageSafetyBatch(t.db, { kind: 'rescue' }, t.deps);
  assert.deepEqual([result.processed, t.writes.length], [0, 0]);
  const probe = await probeImageSafety(t.db, {}, t.deps.fetch);
  assert.equal(probe.processed, 0);
});

test('the address check does not ask for a historical crop whose Blob copy is marked deleted', async () => {
  const { db } = fakeDb({ submissions: [clone(eligible(S.imgbbFinal))] });
  const asked: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    asked.push(String(input));
    return new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-0/9' } });
  }) as typeof fetch;
  const batch = await probeImageSafety(db, {}, fetchImpl);
  assert.equal(batch.gone, 0);
  assert.equal(asked.some((url) => url.includes('pending/')), false, 'the historical Blob source is not queried');
  assert.deepEqual([batch.processed, batch.addresses], [1, 3], 'the framed picture, its ImgBB copy and the ImgBB crop backup');
});
