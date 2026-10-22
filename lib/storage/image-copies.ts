/**
 * Never lose an image (issue 509, docs/STORAGE_ARCHITECTURE.md "Built"): every stored copy of a submission's pictures is written down on the submission, and a copy counts as
 * safe only after it has been read back.
 *
 * - `Submission.imageCopies` is a small list with one entry per `role` (`unframed`: the crop the user saved; `composed`: the framed picture) and `store` (`blob`, `imgbb`):
 *   `{ role, store, state, url, bytes, verifiedAt, recordedAt, deleteUrl?, externalId?, error? }` (type `ImageCopy` in lib/db/schemas.ts). Writing an entry again replaces it, so
 *   a repeat never duplicates.
 * - A copy is `verified` only after a ranged read of its address (`Range: bytes=0-0`, nothing is downloaded) answered with the size that was written. A read that cannot tell (a
 *   timeout, a 5xx) leaves it `unverified`; a copy that was not made, is gone (404) or has another size is `failed`, with the reason in `error`.
 * - Nothing here may fail or slow an approval: `recordApprovalCopies` runs after the answer is sent, never throws, and says what happened in one log line per copy
 *   (`image_copy.outcome`). A copy that is not `verified` is what the admin "Image safety" card lists.
 * - **Mirroring never deletes a source copy.** `makeUnframedFinal` verifies the Blob source and writes/reads back its ImgBB mirror; both remain recorded. Historical `deleted` rows are supported for
 *   cleanup and restore, but this module does not create them. A failed or unverifiable mirror leaves the source untouched.
 * - Apart from deleting an ImgBB file it has just made when the submission was deleted while it worked (so no file is left that
 *   nothing names).
 */

import type { Db, Document, ObjectId } from 'mongodb';
import { COLLECTIONS, type ImageCopy } from '@/lib/db/schemas';
import { isAllowedLogoUrl } from '@/lib/frame/logo';
import { deleteImage, uploadToImgbbOnly, type MirrorResult } from '@/lib/imgbb/upload';
import { logInfo, logWarn } from '@/lib/observability/logger';

/** How long one read-back may take. */
export const PROBE_TIMEOUT_MS = 10_000;
/** How long the upload of one picture to ImgBB may take at most (the host answers in 0.7 s on average and in 10 s at the 95th percentile; the upload itself retries once). */
export const IMGBB_COPY_TIMEOUT_MS = 40_000;
/** How long the work after an approval waits for the ImgBB mirror that the approval itself started. */
export const MIRROR_WAIT_MS = 40_000;

export type CopyRole = ImageCopy['role'];
export type CopyStore = ImageCopy['store'];
export type CopyState = ImageCopy['state'];

export type ProbeResult =
  | { kind: 'size'; bytes: number }
  | { kind: 'gone'; reason: string }
  | { kind: 'unknown'; reason: string };

/**
 * Asks the file's own host how big it is, without downloading it: a one-byte range request, the size read from `Content-Range` (or `Content-Length` when the host ignores the range).
 * `gone` only for a clear 404/410 or an answer that is not an image; anything else that cannot be told (timeout, 5xx, refusal, an address that is not one of our image hosts) is `unknown`.
 */
export async function probeStoredSize(url: string, fetchImpl: typeof fetch = fetch, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  if (!isAllowedLogoUrl(url)) return { kind: 'unknown', reason: 'the address is not on one of our image hosts' };
  try {
    const res = await fetchImpl(url, { headers: { Range: 'bytes=0-0', Accept: 'image/*' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    // Only the headers are wanted; do not let a host that ignored the range stream the whole picture.
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 404 || res.status === 410) return { kind: 'gone', reason: `http ${res.status}` };
    if (res.status !== 200 && res.status !== 206) return { kind: 'unknown', reason: `http ${res.status}` };
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('image/')) return { kind: 'gone', reason: `not an image (${type || 'no content type'})` };
    if (res.status === 206) {
      const total = /\/(\d+)\s*$/.exec(res.headers.get('content-range') ?? '')?.[1];
      return total ? { kind: 'size', bytes: Number(total) } : { kind: 'unknown', reason: 'the host did not say the total size' };
    }
    const length = res.headers.get('content-length');
    return length && /^\d+$/.test(length) ? { kind: 'size', bytes: Number(length) } : { kind: 'unknown', reason: 'the host did not say the size' };
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error && error.name === 'TimeoutError' ? `no answer within ${Math.round(timeoutMs / 1000)} s` : errorMessage(error) };
  }
}

export interface ReadBack {
  state: CopyState;
  verifiedAt: string | null;
  error: string | null;
}

/** Reads a stored file back and compares its size with what was written: `verified`, `failed` (gone or another size) or `unverified` (the host could not tell). */
export async function readBack(url: string, expectedBytes: number, now: string, fetchImpl: typeof fetch = fetch, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ReadBack> {
  const probe = await probeStoredSize(url, fetchImpl, timeoutMs);
  if (probe.kind === 'size') {
    return probe.bytes === expectedBytes
      ? { state: 'verified', verifiedAt: now, error: null }
      : { state: 'failed', verifiedAt: null, error: `wrong size: ${expectedBytes} bytes were written, the host reports ${probe.bytes}` };
  }
  if (probe.kind === 'gone') return { state: 'failed', verifiedAt: null, error: `the file is gone (${probe.reason})` };
  return { state: 'unverified', verifiedAt: null, error: `the read-back could not tell: ${probe.reason}` };
}

/**
 * `readBack` for a file that was just written by us: a "gone" or "could not tell" answer is asked again after a short wait (up to `readBackAttempts` times in all), because a CDN can need a moment before it serves a new
 * file. A size that is known and wrong is never asked again, and a file that answers is not either.
 */
export async function readBackFresh(url: string, expectedBytes: number, deps: Pick<ImageCopyDeps, 'fetch' | 'now' | 'probeTimeoutMs' | 'readBackAttempts' | 'readBackDelayMs'>): Promise<ReadBack> {
  let back = await readBack(url, expectedBytes, deps.now(), deps.fetch, deps.probeTimeoutMs);
  for (let attempt = 1; attempt < deps.readBackAttempts && back.state !== 'verified' && !(back.error ?? '').startsWith('wrong size'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, deps.readBackDelayMs));
    back = await readBack(url, expectedBytes, deps.now(), deps.fetch, deps.probeTimeoutMs);
  }
  return back;
}

const keyOf = (copy: Pick<ImageCopy, 'role' | 'store'>) => ({ role: copy.role, store: copy.store });

/** The copies recorded on a submission (none for a photo that has none). */
export async function readCopies(db: Db, submissionId: ObjectId): Promise<ImageCopy[]> {
  const row = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId }, { projection: { imageCopies: 1 } });
  return Array.isArray(row?.imageCopies) ? (row.imageCopies as ImageCopy[]) : [];
}

/**
 * Writes one copy on the submission: replaces the entry with the same role and store, or adds it. Two single-document updates, each atomic, so two writers (the approval's
 * follow-up work and a card run) cannot lose each other's entries or duplicate one. Returns false when the submission no longer exists.
 */
export async function recordImageCopy(db: Db, submissionId: ObjectId, copy: ImageCopy): Promise<boolean> {
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const same = { $elemMatch: keyOf(copy) };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // The positional `$` stands for the element the `$elemMatch` found, so the entry is replaced as a whole.
    const replaced = await submissions.updateOne({ _id: submissionId, imageCopies: same }, { $set: { 'imageCopies.$': copy } });
    if (replaced.matchedCount > 0) return true;
    const added = await submissions.updateOne({ _id: submissionId, imageCopies: { $not: same } }, { $push: { imageCopies: copy } as Document });
    if (added.matchedCount > 0) return true;
    // Neither matched: either another writer added the entry between the two updates (go round again) or the submission is gone.
    if (!(await submissions.countDocuments({ _id: submissionId }, { limit: 1 }))) return false;
  }
  throw new Error('the copy could not be recorded (the entry kept changing under two writers)');
}

export interface ImageCopyDeps {
  fetch: typeof fetch;
  /** How many times a file that was only just uploaded is read back while the host answers "gone" or cannot tell (a CDN may need a moment before it serves a new file), and how long to wait between tries. */
  readBackAttempts: number;
  readBackDelayMs: number;
  uploadToImgbb: (base64: string, name: string) => Promise<MirrorResult>;
  deleteFromImgbb: (deleteUrl: string) => Promise<boolean>;
  now: () => string;
  probeTimeoutMs: number;
  imgbbTimeoutMs: number;
  mirrorWaitMs: number;
}

export const defaultImageCopyDeps: ImageCopyDeps = {
  fetch: (input, init) => fetch(input, init),
  readBackAttempts: 3,
  readBackDelayMs: 1500,
  // One retry at most, and no validation request of its own: the read-back below is the check.
  uploadToImgbb: (base64, name) => uploadToImgbbOnly(base64, { name, maxRetries: 2, validatePublicUrl: false }),
  deleteFromImgbb: deleteImage,
  now: () => new Date().toISOString(),
  probeTimeoutMs: PROBE_TIMEOUT_MS,
  imgbbTimeoutMs: IMGBB_COPY_TIMEOUT_MS,
  mirrorWaitMs: MIRROR_WAIT_MS,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Resolves with the promise's value, or rejects with a timeout error after `ms`. The promise itself is left running. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** One log line per copy: what was made, whether it was read back, and why not. A copy that is not verified is a warning. */
export function logCopyOutcome(submissionId: string, copy: ImageCopy, startedAt: number): void {
  const context = { submissionId, role: copy.role, store: copy.store, state: copy.state, bytes: copy.bytes, error: copy.error ?? null, ms: Date.now() - startedAt };
  if (copy.state === 'verified') logInfo('image_copy.outcome', `${copy.role} on ${copy.store}: verified`, context);
  else logWarn('image_copy.outcome', `${copy.role} on ${copy.store}: ${copy.state}`, context);
}

/** Records a copy and logs its outcome. A database failure is logged and returned as false; it never throws. */
async function record(db: Db, submissionId: ObjectId, copy: ImageCopy, startedAt: number): Promise<boolean> {
  logCopyOutcome(String(submissionId), copy, startedAt);
  try {
    const recorded = await recordImageCopy(db, submissionId, copy);
    if (!recorded) logWarn('image_copy.submission_gone', 'The submission was deleted while its copy was being recorded', { submissionId: String(submissionId), role: copy.role, store: copy.store });
    return recorded;
  } catch (error) {
    logWarn('image_copy.not_recorded', 'A copy could not be recorded on its submission', { submissionId: String(submissionId), role: copy.role, store: copy.store, state: copy.state, error: errorMessage(error) });
    return false;
  }
}

/** Reads a file of ours back and records it (`blob` copies, and an ImgBB address a mirror already made). */
export async function verifyAndRecord(
  db: Db,
  submissionId: ObjectId,
  entry: { role: CopyRole; store: CopyStore; url: string; bytes: number; deleteUrl?: string | null; externalId?: string | null },
  deps: ImageCopyDeps = defaultImageCopyDeps
): Promise<ImageCopy> {
  const startedAt = Date.now();
  const back = await readBackFresh(entry.url, entry.bytes, deps);
  const now = deps.now();
  const copy: ImageCopy = { role: entry.role, store: entry.store, state: back.state, url: entry.url, bytes: entry.bytes, verifiedAt: back.verifiedAt, recordedAt: now, error: back.error };
  if (entry.deleteUrl) copy.deleteUrl = entry.deleteUrl;
  if (entry.externalId) copy.externalId = entry.externalId;
  await record(db, submissionId, copy, startedAt);
  return copy;
}

/** Records that a copy could not be made (no address), so the Image safety card can list it. */
export async function recordFailure(
  db: Db,
  submissionId: ObjectId,
  entry: { role: CopyRole; store: CopyStore; bytes: number | null; error: string },
  deps: Pick<ImageCopyDeps, 'now'> = defaultImageCopyDeps
): Promise<ImageCopy> {
  const copy: ImageCopy = { role: entry.role, store: entry.store, state: 'failed', url: null, bytes: entry.bytes, verifiedAt: null, recordedAt: deps.now(), error: entry.error };
  await record(db, submissionId, copy, Date.now());
  return copy;
}

/**
 * Makes a copy of a picture on ImgBB, reads it back and records it. Never throws. A failed upload is recorded as `failed` with its reason; an upload that worked but cannot be
 * read back is kept with its address and delete link (`unverified` / `failed`), so deleting the submission still reaches it. If the submission was deleted meanwhile, the file just
 * made is deleted again, so no public file is left that nothing names.
 */
export async function makeImgbbCopy(
  db: Db,
  input: { submissionId: ObjectId; role: CopyRole; buffer: Buffer; name: string },
  deps: ImageCopyDeps = defaultImageCopyDeps
): Promise<ImageCopy> {
  const startedAt = Date.now();
  const bytes = input.buffer.length;
  let uploaded: MirrorResult;
  try {
    uploaded = await withTimeout(deps.uploadToImgbb(input.buffer.toString('base64'), input.name), deps.imgbbTimeoutMs, 'imgbb');
  } catch (error) {
    return recordFailure(db, input.submissionId, { role: input.role, store: 'imgbb', bytes, error: `the upload to imgbb failed: ${errorMessage(error)}` }, deps);
  }
  const back = await readBackFresh(uploaded.imageUrl, bytes, deps);
  const now = deps.now();
  const copy: ImageCopy = {
    role: input.role,
    store: 'imgbb',
    state: back.state,
    url: uploaded.imageUrl,
    bytes,
    verifiedAt: back.verifiedAt,
    recordedAt: now,
    deleteUrl: uploaded.deleteUrl || null,
    externalId: uploaded.imageId || null,
    error: back.error,
  };
  const recorded = await record(db, input.submissionId, copy, startedAt);
  if (!recorded && uploaded.deleteUrl) {
    // Recording failed for a reason other than the database being down (the row is gone): do not leave a public file that no submission names.
    const exists = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({ _id: input.submissionId }, { limit: 1 }).catch(() => 1);
    if (!exists) {
      const removed = await deps.deleteFromImgbb(uploaded.deleteUrl).catch(() => false);
      logWarn('image_copy.orphan_removed', removed ? 'The ImgBB file made for a deleted submission was deleted again' : 'The ImgBB file made for a deleted submission could not be deleted; remove it by hand', { submissionId: String(input.submissionId), role: input.role, url: uploaded.imageUrl });
    }
  }
  return copy;
}

const sameCrop = (copy: ImageCopy | undefined, store: ImageCopy['store']) => copy?.role === 'unframed' && copy.store === store;
export interface UnframedResult {
  /** The entries written by this call. */
  made: ImageCopy[];
  /** True when ImgBB has a verified mirror. The Blob source is retained. */
  mirrored: boolean;
  /** Why a verified mirror could not be made. */
  reason: string | null;
}

/**
 * The unframed photo's Blob source is verified and mirrored to ImgBB. The two copies are retained. Used by approval follow-up work and the Image safety card; a failed mirror never removes or
 * changes the Blob source. Repeating it is safe: a verified mirror is not uploaded again.
 */
export async function makeUnframedFinal(
  db: Db,
  input: { submissionId: ObjectId; url: string; buffer: Buffer | null },
  deps: ImageCopyDeps = defaultImageCopyDeps
): Promise<UnframedResult> {
  const id = String(input.submissionId);
  const made: ImageCopy[] = [];
  let existing: ImageCopy[] = [];
  try {
    existing = await readCopies(db, input.submissionId);
  } catch (error) {
    logWarn('image_copy.not_read', 'The copies of a submission could not be read; they are written again', { submissionId: id, error: errorMessage(error) });
  }
  const blob = existing.find((copy) => sameCrop(copy, 'blob'));
  const imgbb = existing.find((copy) => sameCrop(copy, 'imgbb'));
  if (blob?.state === 'deleted') return { made, mirrored: imgbb?.state === 'verified', reason: imgbb?.state === 'verified' ? null : 'the historical Blob source is marked deleted and must be restored from its ImgBB copy' };
  let verifiedOnImgbb = imgbb?.state === 'verified' && Boolean(imgbb.url);
  if (!verifiedOnImgbb) {
    if (!input.buffer) return { made, mirrored: false, reason: 'the crop was not read, so its ImgBB copy cannot be made' };
    if (blob?.state !== 'verified') made.push(await verifyAndRecord(db, input.submissionId, { role: 'unframed', store: 'blob', url: input.url, bytes: input.buffer.length }, deps));
    const copy = await makeImgbbCopy(db, { submissionId: input.submissionId, role: 'unframed', buffer: input.buffer, name: `unframed-${id}` }, deps);
    made.push(copy);
    verifiedOnImgbb = copy.state === 'verified';
    if (!verifiedOnImgbb) return { made, mirrored: false, reason: copy.error ?? 'the ImgBB copy could not be verified' };
  }
  return { made, mirrored: true, reason: null };
}

export interface ApprovalCopiesInput {
  submissionId: ObjectId;
  /** The framed picture the approval made: its Blob address and size, and the ImgBB mirror the approval started (a promise that may still be running, or its result, or null when imgbb gave nothing). */
  composed: { url: string; bytes: number; mirror: Promise<MirrorResult | null> | MirrorResult | null };
  /** The user's unframed crop: its (private) Blob address and the bytes the approval read from it; null when there is none. */
  unframed: { url: string; buffer: Buffer } | null;
}

/**
 * The work after an approval: records every copy that now exists of this photo, and makes the one that did not exist, the unframed crop on ImgBB (owner decision 295).
 * It runs after the answer is sent, never throws, and a copy that does not work only ends as `failed` or `unverified` on the submission and in the log; the approval is already done.
 * Repeating it does not duplicate: a copy that is already `verified` is left alone.
 */
export async function recordApprovalCopies(db: Db, input: ApprovalCopiesInput, deps: ImageCopyDeps = defaultImageCopyDeps): Promise<ImageCopy[]> {
  const id = String(input.submissionId);
  const made: ImageCopy[] = [];
  let existing: ImageCopy[] = [];
  try {
    existing = await readCopies(db, input.submissionId);
  } catch (error) {
    logWarn('image_copy.not_read', 'The copies of a submission could not be read; they are written again', { submissionId: id, error: errorMessage(error) });
  }
  const done = (role: CopyRole, store: CopyStore) => existing.some((copy) => copy.role === role && copy.store === store && copy.state === 'verified');
  const branch = async (what: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      logWarn('image_copy.step_failed', `Recording the ${what} failed`, { submissionId: id, error: errorMessage(error) });
    }
  };

  const composed = async () => {
    if (!done('composed', 'blob')) made.push(await verifyAndRecord(db, input.submissionId, { role: 'composed', store: 'blob', url: input.composed.url, bytes: input.composed.bytes }, deps));
    if (done('composed', 'imgbb')) return;
    let mirror: MirrorResult | null = null;
    try {
      mirror = await withTimeout(Promise.resolve(input.composed.mirror), deps.mirrorWaitMs, 'imgbb');
    } catch (error) {
      made.push(await recordFailure(db, input.submissionId, { role: 'composed', store: 'imgbb', bytes: input.composed.bytes, error: `no ImgBB copy of the framed picture: ${errorMessage(error)}` }, deps));
      return;
    }
    if (!mirror) {
      made.push(await recordFailure(db, input.submissionId, { role: 'composed', store: 'imgbb', bytes: input.composed.bytes, error: 'no ImgBB copy of the framed picture was made (imgbb failed or is not configured)' }, deps));
      return;
    }
    made.push(await verifyAndRecord(db, input.submissionId, { role: 'composed', store: 'imgbb', url: mirror.imageUrl, bytes: input.composed.bytes, deleteUrl: mirror.deleteUrl, externalId: mirror.imageId }, deps));
  };

  const unframed = async () => {
    if (!input.unframed) return;
    made.push(...(await makeUnframedFinal(db, { submissionId: input.submissionId, url: input.unframed.url, buffer: input.unframed.buffer }, deps)).made);
  };

  // The two pictures are independent; each branch writes only its own entries.
  await Promise.all([branch('framed picture copies', composed), branch('unframed picture copies', unframed)]);
  return made;
}
