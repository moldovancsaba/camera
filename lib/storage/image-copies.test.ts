import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import type { ImageCopy } from '@/lib/db/schemas';
import { fakeDb } from '@/lib/library/fake-db';
import type { MirrorResult } from '@/lib/imgbb/upload';
import {
  makeImgbbCopy,
  probeStoredSize,
  readBack,
  readBackFresh,
  readCopies,
  recordApprovalCopies,
  recordImageCopy,
  type ImageCopyDeps,
} from './image-copies';

const STORE = 'abc123.public.blob.vercel-storage.com';
const PENDING = `https://${STORE}/pending/e1/abc-xyz.jpg`;
const COMPOSED = `https://${STORE}/submission-1.jpg`;
const AT = '2026-10-12T10:00:00.000Z';
const CROP = Buffer.from('the-unframed-crop-bytes');
const COMPOSED_BYTES = 1234;
const MIRROR: MirrorResult = { imageUrl: 'https://i.ibb.co/m1/composed.jpg', deleteUrl: 'https://ibb.co/m1/delete-composed', imageId: 'm1' };

/** A host that serves each address with a size (or an error status), and answers a one-byte range request the way Vercel Blob and ImgBB do. */
function fakeHost(files: Record<string, { size?: number; status?: number; type?: string; ignoreRange?: boolean }> = {}) {
  const asked: string[] = [];
  const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    asked.push(`${url} ${init?.headers?.Range ?? ''}`);
    const file = files[url];
    if (!file) return new Response(null, { status: 404 });
    if (file.status && file.status !== 200 && file.status !== 206) return new Response(null, { status: file.status });
    const headers: Record<string, string> = { 'content-type': file.type ?? 'image/jpeg' };
    if (file.ignoreRange) {
      headers['content-length'] = String(file.size);
      return new Response(null, { status: 200, headers });
    }
    headers['content-range'] = `bytes 0-0/${file.size}`;
    return new Response(null, { status: 206, headers });
  }) as typeof fetch;
  return { fetchImpl, files, asked };
}

function submissionId() {
  return new ObjectId();
}

function setup(options: { files?: Record<string, { size?: number; status?: number; type?: string; ignoreRange?: boolean }>; imgbb?: 'works' | 'fails' | 'hangs' | 'wrong-size' | 'unreadable'; seed?: Record<string, unknown> } = {}) {
  const id = submissionId();
  const { db, data } = fakeDb({ submissions: [{ _id: id, imageCopies: [], ...(options.seed ?? {}) }] });
  const host = fakeHost({ [PENDING]: { size: CROP.length }, [COMPOSED]: { size: COMPOSED_BYTES }, [MIRROR.imageUrl]: { size: COMPOSED_BYTES }, ...(options.files ?? {}) });
  const uploads: Array<{ base64: string; name: string }> = [];
  const deleted: string[] = [];
  const mode = options.imgbb ?? 'works';
  const deps: ImageCopyDeps = {
    fetch: host.fetchImpl,
    uploadToImgbb: async (base64, name) => {
      uploads.push({ base64, name });
      if (mode === 'fails') throw new Error('imgbb answered 500');
      if (mode === 'hangs') return new Promise<MirrorResult>(() => undefined);
      const n = uploads.length;
      const result = { imageUrl: `https://i.ibb.co/n${n}/${name}.jpg`, deleteUrl: `https://ibb.co/n${n}/delete-${n}`, imageId: `n${n}` };
      if (mode !== 'unreadable') host.files[result.imageUrl] = { size: mode === 'wrong-size' ? Buffer.from(base64, 'base64').length + 7 : Buffer.from(base64, 'base64').length };
      return result;
    },
    deleteFromImgbb: async (link) => (deleted.push(link), true),
    now: () => AT,
    readBackAttempts: 1,
    readBackDelayMs: 0,
    probeTimeoutMs: 1000,
    imgbbTimeoutMs: 40,
    mirrorWaitMs: 40,
  };
  const copies = () => (data.submissions[0].imageCopies as ImageCopy[]) ?? [];
  const find = (role: string, store: string) => copies().find((copy) => copy.role === role && copy.store === store);
  return { id, db, data, host, deps, uploads, deleted, copies, find };
}

const approval = (id: ObjectId, mirror: Promise<MirrorResult | null> | MirrorResult | null = MIRROR, unframed: { url: string; buffer: Buffer } | null = { url: PENDING, buffer: CROP }) => ({
  submissionId: id,
  composed: { url: COMPOSED, bytes: COMPOSED_BYTES, mirror },
  unframed,
});

// ---- the read-back --------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a one-byte range request gives the size from Content-Range, or from Content-Length when the host ignores the range', async () => {
  const host = fakeHost({ [COMPOSED]: { size: 777 }, [PENDING]: { size: 55, ignoreRange: true } });
  assert.deepEqual(await probeStoredSize(COMPOSED, host.fetchImpl), { kind: 'size', bytes: 777 });
  assert.deepEqual(await probeStoredSize(PENDING, host.fetchImpl), { kind: 'size', bytes: 55 });
  assert.match(host.asked[0], /Range|bytes=0-0/, 'only one byte is asked for');
  assert.ok(host.asked.every((line) => line.endsWith('bytes=0-0')));
});

test('gone is a 404, 410 or an answer that is not an image; a timeout, a 5xx, a refusal and a foreign host are unknown', async () => {
  const host = fakeHost({ [COMPOSED]: { size: 1, type: 'text/html' }, [PENDING]: { status: 503 } });
  assert.deepEqual(await probeStoredSize(`https://${STORE}/missing.jpg`, host.fetchImpl), { kind: 'gone', reason: 'http 404' });
  assert.deepEqual(await probeStoredSize(COMPOSED, host.fetchImpl), { kind: 'gone', reason: 'not an image (text/html)' });
  assert.deepEqual(await probeStoredSize(PENDING, host.fetchImpl), { kind: 'unknown', reason: 'http 503' });
  const timeout = (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
  assert.deepEqual(await probeStoredSize(COMPOSED, timeout, 10_000), { kind: 'unknown', reason: 'no answer within 10 s' });
  const calls: string[] = [];
  const counting = (async (url: unknown) => (calls.push(String(url)), new Response(null, { status: 200 }))) as typeof fetch;
  assert.equal((await probeStoredSize('https://example.com/a.jpg', counting)).kind, 'unknown');
  assert.deepEqual(calls, [], 'an address that is not one of our image hosts is never requested');
});

test('read back: the right size is verified, another size is failed with both numbers, a missing file is failed, an unclear answer is unverified', async () => {
  const host = fakeHost({ [COMPOSED]: { size: 100 }, [PENDING]: { status: 502 } });
  assert.deepEqual(await readBack(COMPOSED, 100, AT, host.fetchImpl), { state: 'verified', verifiedAt: AT, error: null });
  const wrong = await readBack(COMPOSED, 90, AT, host.fetchImpl);
  assert.equal(wrong.state, 'failed');
  assert.equal(wrong.verifiedAt, null);
  assert.match(wrong.error ?? '', /90 bytes were written, the host reports 100/);
  assert.equal((await readBack(`https://${STORE}/nope.jpg`, 1, AT, host.fetchImpl)).state, 'failed');
  const unclear = await readBack(PENDING, 1, AT, host.fetchImpl);
  assert.equal(unclear.state, 'unverified');
  assert.equal(unclear.verifiedAt, null);
});

// ---- recording ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const entry = (role: ImageCopy['role'], store: ImageCopy['store'], extra: Partial<ImageCopy> = {}): ImageCopy => ({ role, store, state: 'verified', url: `https://${STORE}/${role}-${store}.jpg`, bytes: 10, verifiedAt: AT, recordedAt: AT, ...extra });

test('recording adds an entry per role and store and replaces the one it already has; the rest stay', async () => {
  const { id, db, copies } = setup();
  assert.equal(await recordImageCopy(db, id, entry('unframed', 'blob')), true);
  assert.equal(await recordImageCopy(db, id, entry('unframed', 'imgbb', { state: 'failed', url: null, verifiedAt: null, error: 'first try' })), true);
  assert.equal(await recordImageCopy(db, id, entry('unframed', 'imgbb', { error: null })), true);
  assert.deepEqual(copies().map((copy) => `${copy.role}/${copy.store}/${copy.state}`), ['unframed/blob/verified', 'unframed/imgbb/verified']);
  assert.equal((await readCopies(db, id)).length, 2);
});

test('two writers of the same copy at once leave one entry; a submission that is gone records nothing', async () => {
  const { id, db, copies } = setup();
  await Promise.all([recordImageCopy(db, id, entry('composed', 'blob')), recordImageCopy(db, id, entry('composed', 'blob', { bytes: 11 }))]);
  assert.equal(copies().length, 1);
  assert.equal(await recordImageCopy(db, new ObjectId(), entry('composed', 'blob')), false);
});

// ---- the work after an approval ---------------------------------------------------------------------------------------------------------------------------------

test('after an approval every copy that exists is recorded, with its address, size, read-back time and the ImgBB delete links', async () => {
  const { id, db, deps, uploads, copies, find } = setup();
  const made = await recordApprovalCopies(db, approval(id), deps);
  assert.equal(made.length, 4);
  assert.deepEqual(copies().map((copy) => `${copy.role}/${copy.store}/${copy.state}`).sort(), ['composed/blob/verified', 'composed/imgbb/verified', 'unframed/blob/verified', 'unframed/imgbb/verified']);
  for (const copy of copies()) assert.deepEqual([copy.verifiedAt, copy.recordedAt, copy.error], [AT, AT, null]);
  assert.deepEqual([find('unframed', 'blob')?.url, find('unframed', 'blob')?.bytes], [PENDING, CROP.length]);
  assert.deepEqual([find('composed', 'blob')?.url, find('composed', 'blob')?.bytes], [COMPOSED, COMPOSED_BYTES]);
  assert.equal(find('composed', 'imgbb')?.url, MIRROR.imageUrl, 'the mirror the approval started is recorded with its real address');
  assert.equal(find('composed', 'imgbb')?.deleteUrl, MIRROR.deleteUrl);
  assert.equal(find('composed', 'imgbb')?.externalId, 'm1');
  assert.equal(uploads.length, 1, 'only the unframed crop is uploaded to imgbb here');
  assert.ok(Buffer.from(uploads[0].base64, 'base64').equals(CROP), 'the bytes the approval read from the private file are the bytes sent');
  assert.match(find('unframed', 'imgbb')?.url ?? '', /^https:\/\/i\.ibb\.co\//);
  assert.match(find('unframed', 'imgbb')?.deleteUrl ?? '', /^https:\/\/ibb\.co\//);
  assert.equal(find('unframed', 'imgbb')?.bytes, CROP.length);
});

test('repeating the work does not duplicate: verified copies are left alone and imgbb is not asked again', async () => {
  const { id, db, deps, uploads, copies, host } = setup();
  await recordApprovalCopies(db, approval(id), deps);
  const asked = host.asked.length;
  const again = await recordApprovalCopies(db, approval(id), deps);
  assert.deepEqual(again, []);
  assert.equal(copies().length, 4);
  assert.equal(uploads.length, 1);
  assert.equal(host.asked.length, asked, 'nothing is read back again either');
});

test('an imgbb that fails still leaves the other copies recorded, and the failure is on the submission with its reason', async () => {
  const { id, db, deps, find, copies } = setup({ imgbb: 'fails' });
  await recordApprovalCopies(db, approval(id), deps);
  const failed = find('unframed', 'imgbb');
  assert.equal(failed?.state, 'failed');
  assert.equal(failed?.url, null);
  assert.equal(failed?.verifiedAt, null);
  assert.match(failed?.error ?? '', /upload to imgbb failed: imgbb answered 500/);
  assert.equal(failed?.bytes, CROP.length);
  assert.equal(find('unframed', 'blob')?.state, 'verified');
  assert.equal(find('composed', 'imgbb')?.state, 'verified');
  assert.equal(copies().length, 4);
});

test('an imgbb that does not answer in time is recorded as failed and the work ends', async () => {
  const { id, db, deps, find } = setup({ imgbb: 'hangs' });
  const started = Date.now();
  await recordApprovalCopies(db, approval(id), deps);
  assert.ok(Date.now() - started < 2000, 'the work did not wait for ever');
  assert.equal(find('unframed', 'imgbb')?.state, 'failed');
  assert.match(find('unframed', 'imgbb')?.error ?? '', /imgbb did not answer within 0\.04 s/);
});

test('an imgbb file with the wrong size is recorded as failed, with both sizes, and keeps its address and delete link so deleting the submission still reaches it', async () => {
  const { id, db, deps, find } = setup({ imgbb: 'wrong-size' });
  await recordApprovalCopies(db, approval(id), deps);
  const copy = find('unframed', 'imgbb');
  assert.equal(copy?.state, 'failed');
  assert.match(copy?.error ?? '', new RegExp(`${CROP.length} bytes were written, the host reports ${CROP.length + 7}`));
  assert.ok(copy?.url && copy.deleteUrl);
});

test('an imgbb file that cannot be read back yet is unverified, not failed, and keeps its address', async () => {
  const { id, db, deps, find } = setup({ imgbb: 'unreadable' });
  await recordApprovalCopies(db, approval(id), deps);
  // The fake host does not know the new address, so it answers 404: gone.
  assert.equal(find('unframed', 'imgbb')?.state, 'failed');
  const { id: id2, db: db2, deps: deps2, host, find: find2 } = setup({ imgbb: 'unreadable' });
  const flaky: typeof fetch = async (input, init) => (String(input).includes('i.ibb.co') ? new Response(null, { status: 503 }) : host.fetchImpl(input, init));
  await recordApprovalCopies(db2, approval(id2), { ...deps2, fetch: flaky });
  assert.equal(find2('unframed', 'imgbb')?.state, 'unverified');
  assert.ok(find2('unframed', 'imgbb')?.url);
  assert.equal(find2('unframed', 'imgbb')?.verifiedAt, null);
});

test('when the approval got no ImgBB copy of the framed picture, that is recorded as failed instead of nothing', async () => {
  const none = setup();
  await recordApprovalCopies(none.db, approval(none.id, null), none.deps);
  assert.equal(none.find('composed', 'imgbb')?.state, 'failed');
  assert.match(none.find('composed', 'imgbb')?.error ?? '', /no ImgBB copy of the framed picture was made/);
  assert.equal(none.find('composed', 'blob')?.state, 'verified');

  const slow = setup();
  await recordApprovalCopies(slow.db, approval(slow.id, new Promise(() => undefined)), slow.deps);
  assert.equal(slow.find('composed', 'imgbb')?.state, 'failed');
  assert.match(slow.find('composed', 'imgbb')?.error ?? '', /did not answer within/);
});

test('a mirror that lands late but within the wait is recorded with its real address', async () => {
  const { id, db, deps, find } = setup();
  const late = new Promise<MirrorResult>((resolve) => setTimeout(() => resolve(MIRROR), 10));
  await recordApprovalCopies(db, approval(id, late), deps);
  assert.equal(find('composed', 'imgbb')?.state, 'verified');
  assert.equal(find('composed', 'imgbb')?.url, MIRROR.imageUrl);
});

test('a failed copy is made again by a later run and replaces its failed entry; the verified ones are not touched', async () => {
  const first = setup({ imgbb: 'fails' });
  await recordApprovalCopies(first.db, approval(first.id), first.deps);
  assert.equal(first.find('unframed', 'imgbb')?.state, 'failed');
  let uploads = 0;
  const second = { ...first.deps, uploadToImgbb: async (base64: string, name: string): Promise<MirrorResult> => {
    uploads += 1;
    const result = { imageUrl: `https://i.ibb.co/r/${name}.jpg`, deleteUrl: 'https://ibb.co/r/del', imageId: 'r' };
    first.host.files[result.imageUrl] = { size: Buffer.from(base64, 'base64').length };
    return result;
  } };
  await recordApprovalCopies(first.db, approval(first.id), second);
  assert.equal(uploads, 1);
  assert.equal(first.copies().length, 4, 'the failed entry was replaced, not added to');
  assert.equal(first.find('unframed', 'imgbb')?.state, 'verified');
});

test('a photo with no private file records only the framed picture', async () => {
  const { id, db, deps, copies, uploads } = setup();
  await recordApprovalCopies(db, approval(id, MIRROR, null), deps);
  assert.deepEqual(copies().map((copy) => copy.role), ['composed', 'composed']);
  assert.equal(uploads.length, 0);
});

test('a submission deleted while its imgbb copy was being made does not leave the file behind', async () => {
  const { id, db, data, deps, deleted } = setup();
  const slowUpload = deps.uploadToImgbb;
  const racing = { ...deps, uploadToImgbb: async (base64: string, name: string) => {
    const result = await slowUpload(base64, name);
    data.submissions.length = 0;
    return result;
  } };
  const copy = await makeImgbbCopy(db, { submissionId: id, role: 'unframed', buffer: CROP, name: 'unframed-x' }, racing);
  assert.equal(copy.state, 'verified');
  assert.equal(data.submissions.length, 0);
  assert.deepEqual(deleted, [copy.deleteUrl], 'the file just made is deleted through its link');
});

test('the work never throws: a database that fails to write is logged and the approval work ends', async () => {
  const { id, deps } = setup();
  const broken = { collection: () => ({ findOne: async () => { throw new Error('mongo down'); }, updateOne: async () => { throw new Error('mongo down'); }, countDocuments: async () => { throw new Error('mongo down'); } }) };
  const made = await recordApprovalCopies(broken as never, approval(id), deps);
  assert.ok(Array.isArray(made));
});

test('a file that was only just uploaded is read back again while the host says gone or cannot tell, and a wrong size is never asked again', async () => {
  const answers = [404, 503, 206];
  let asked = 0;
  const flaky = (async () => {
    const status = answers[Math.min(asked, answers.length - 1)];
    asked += 1;
    return status === 206 ? new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-0/50' } }) : new Response(null, { status });
  }) as typeof fetch;
  const base = { fetch: flaky, now: () => AT, probeTimeoutMs: 1000, readBackAttempts: 3, readBackDelayMs: 0 };
  const settled = await readBackFresh(COMPOSED, 50, base);
  assert.deepEqual([settled.state, asked], ['verified', 3], 'a CDN that needs a moment is waited for');

  asked = 0;
  const never = await readBackFresh(COMPOSED, 50, { ...base, readBackAttempts: 2, fetch: (async () => (asked++, new Response(null, { status: 404 }))) as typeof fetch });
  assert.deepEqual([never.state, asked], ['failed', 2], 'a file that stays gone ends failed after the attempts');

  asked = 0;
  const wrong = await readBackFresh(COMPOSED, 49, { ...base, fetch: (async () => (asked++, new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-0/50' } }))) as typeof fetch });
  assert.deepEqual([wrong.state, asked], ['failed', 1], 'a size that is known and wrong is not asked again');
});
