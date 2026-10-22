/**
 * The Image safety card (issue 509, docs/STORAGE_ARCHITECTURE.md "Built"): which pictures have only one copy, and a bounded, repeatable run that makes the missing copy.
 *
 * - **The count (dry run, `planImageSafety`) writes nothing.** It reads every submission that has a picture (a stored try-on result is left out: it is never public and is kept as it is) and
 *   puts it in one group by where its framed picture is held: only on ImgBB (the old photos from before Vercel Blob became primary), only on Blob, on both, on another host. It
 *   also groups the unframed crops (on Blob only, on ImgBB only = final, on both), counts the crops kept in our store because their ImgBB copy could not be verified, and the copies that were
 *   not made or could not be verified. The groups use `Submission.imageCopies` (lib/storage/image-copies.ts): a picture counts as
 *   held by a store when its stored address is there or a `verified` copy is.
 * - **The address check (`probeImageSafety`) writes nothing either.** A bounded batch of one-byte range requests to the addresses the photos name; it lists the ones that did not answer.
 * - **The run (`runImageSafetyBatch`) only adds or repairs copies.** One bounded batch per call, one kind at a time: `rescue` copies a composed picture from ImgBB to Blob, `mirror` copies a composed picture from Blob to ImgBB,
 *   `unframed` mirrors an approved crop from Blob to ImgBB, and `unframed-rescue` restores a historical crop from ImgBB to Blob. No source file or submission address is deleted. Every copy is read back before it counts.
 *   Only submissions with a structurally valid consent audit are eligible for this repair workflow; consent-pending, unknown, expired, or erasure-state photos are excluded.
 */

import { put } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { COLLECTIONS, type ImageCopy } from '@/lib/db/schemas';
import { hasVerifiableConsentAudit } from '@/lib/events/consent-eligibility';
import { isAllowedLogoUrl } from '@/lib/frame/logo';
import { detectImageProvider } from '@/lib/imgbb/url';
import { isMissingImagePlaceholder } from '@/lib/media/placeholder';
import { fetchImageBuffer } from '@/lib/media/image-buffer';
import { logWarn } from '@/lib/observability/logger';
import {
  defaultImageCopyDeps,
  makeImgbbCopy,
  makeUnframedFinal,
  probeStoredSize,
  recordFailure,
  recordImageCopy,
  verifyAndRecord,
  type ImageCopyDeps,
} from '@/lib/storage/image-copies';

export type SafetyKind = 'rescue' | 'mirror' | 'unframed' | 'unframed-rescue';
export const SAFETY_KINDS: readonly SafetyKind[] = ['rescue', 'mirror', 'unframed', 'unframed-rescue'];

const PAGE = 200;
/** The fields of a submission that the classification needs, nothing more (the walk reads every photo). */
const PROJECTION = {
  eventId: 1,
  eventIds: 1,
  imageUrl: 1,
  finalImageUrl: 1,
  imageCopies: 1,
  'photoReview.photoUrl': 1,
  reviewStatus: 1,
  deleteUrl: 1,
  imageId: 1,
  consentStatus: 1,
  consents: 1,
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const copiesOf = (doc: Document): ImageCopy[] => (Array.isArray(doc.imageCopies) ? (doc.imageCopies as ImageCopy[]).filter((copy) => copy && typeof copy === 'object') : []);

/** The framed picture the public sees: the final one, else the stored one (the same order as lib/media/broken.ts `publicPictureOf`). */
export function primaryPicture(doc: Document): string | null {
  return text(doc.finalImageUrl) ?? text(doc.imageUrl);
}

type Side = 'blob' | 'imgbb' | 'other';
const sideOf = (url: string | null): Side => (url ? (detectImageProvider(url) ?? 'other') : 'other');

const verified = (doc: Document, role: ImageCopy['role'], store: ImageCopy['store']): boolean =>
  copiesOf(doc).some((copy) => copy.role === role && copy.store === store && copy.state === 'verified' && Boolean(text(copy.url)));

export type ComposedState = 'imgbb-only' | 'blob-only' | 'both' | 'other' | 'none';
/**
 * The unframed crop of an approved photo: `blob-only`, `imgbb-only` (a historical single copy that needs restoring), `both`, or `none`. Waiting and rejected photos stay out of the public mirror workflow.
 */
export type UnframedState = 'none' | 'blob-only' | 'imgbb-only' | 'both' | 'waiting' | 'rejected';

export interface Classified {
  composed: ComposedState;
  /** `blob-only`, and an old ImgBB copy exists whose address was never kept (the photo has an old mirror record): it is made again so it can be read back. */
  oldMirrorRecord: boolean;
  unframed: UnframedState;
  /** An approved photo whose crop is still in Blob although its ImgBB copy was not verified. */
  cropKeptUnverified: boolean;
  /** Copies that were not made (no address). */
  notMade: number;
  /** Copies that were written (they have an address) but whose read-back did not confirm them: unconfirmed, gone, or another size. */
  couldNotVerify: number;
}

/** Where a submission's pictures are held, from its stored address and its recorded copies. */
export function classify(doc: Document): Classified {
  const primary = primaryPicture(doc);
  const side = sideOf(primary);
  const blob = side === 'blob' || verified(doc, 'composed', 'blob');
  const imgbb = side === 'imgbb' || verified(doc, 'composed', 'imgbb');
  const composed: ComposedState = !primary ? 'none' : blob && imgbb ? 'both' : blob ? 'blob-only' : imgbb ? 'imgbb-only' : 'other';

  const copies = copiesOf(doc);
  const cropOnBlob = Boolean(text((doc.photoReview as Document | undefined)?.photoUrl)) && !copies.some((copy) => copy.role === 'unframed' && copy.store === 'blob' && copy.state === 'deleted');
  const cropOnImgbb = verified(doc, 'unframed', 'imgbb');
  let unframed: UnframedState = 'none';
  if (doc.reviewStatus === 'approved') unframed = cropOnBlob ? (cropOnImgbb ? 'both' : 'blob-only') : cropOnImgbb ? 'imgbb-only' : 'none';
  else if (cropOnBlob) unframed = doc.reviewStatus === 'rejected' ? 'rejected' : 'waiting';
  const unconfirmedCropCopy = copies.some((copy) => copy.role === 'unframed' && copy.store === 'imgbb' && Boolean(text(copy.url)) && (copy.state === 'failed' || copy.state === 'unverified'));
  return {
    composed,
    oldMirrorRecord: composed === 'blob-only' && Boolean(text(doc.deleteUrl) || text(doc.imageId)),
    unframed,
    cropKeptUnverified: unframed === 'blob-only' && unconfirmedCropCopy,
    notMade: copies.filter((copy) => copy.state === 'failed' && !text(copy.url)).length,
    couldNotVerify: copies.filter((copy) => (copy.state === 'unverified' || copy.state === 'failed') && Boolean(text(copy.url))).length,
  };
}

/** Is this submission one that a run of `kind` has something to do for? */
export function needs(kind: SafetyKind, doc: Document): boolean {
  const c = classify(doc);
  if (kind === 'rescue') return c.composed === 'imgbb-only';
  if (kind === 'mirror') return c.composed === 'blob-only';
  if (kind === 'unframed') return c.unframed === 'blob-only';
  return c.unframed === 'imgbb-only';
}

/** Walks the submissions that can have a picture, by id, a page at a time. A stored try-on result is left out. */
async function* pages(db: Db, after?: ObjectId): AsyncGenerator<Document[]> {
  let cursor = after;
  for (;;) {
    const filter: Document = { submissionKind: { $ne: 'tryon_result' }, ...(cursor ? { _id: { $gt: cursor } } : {}) };
    const rows = await db.collection(COLLECTIONS.SUBMISSIONS).find(filter, { projection: PROJECTION }).sort({ _id: 1 }).limit(PAGE).toArray();
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
    cursor = rows[rows.length - 1]._id as ObjectId;
  }
}

export interface ImageSafetyPlan {
  /** Submissions that have a picture (a stored try-on result is not counted). */
  pictures: number;
  /** Stored try-on results of the removed integration: kept as they are, never copied. */
  tryOnResults: number;
  /** Photos with no structurally valid consent audit. They are never probed or copied by this repair tool. */
  consentExcluded: number;
  /** Where the framed picture is held. `blobOnlyOldMirror` is the part of `blobOnly` that has an old ImgBB mirror record without an address. */
  composed: { imgbbOnly: number; blobOnly: number; blobOnlyOldMirror: number; both: number; other: number };
  /** Unframed crops: approved photos by where a verified copy exists, plus waiting and rejected crops. */
  unframed: { blobOnly: number; imgbbOnly: number; both: number; waiting: number; rejected: number; keptUnverified: number };
  /** Recorded copies that are not good: `notMade` (no file), `couldNotVerify` (a file that was written but whose read-back did not confirm it), and the photos that have one of either. */
  copies: { notMade: number; couldNotVerify: number; photosWithAProblem: number };
  /** What a run would do, one number per kind. */
  toDo: Record<SafetyKind, number>;
}

/** The count (dry run): reads, writes nothing, asks no host. */
export async function planImageSafety(db: Db): Promise<ImageSafetyPlan> {
  const plan: ImageSafetyPlan = {
    pictures: 0,
    tryOnResults: await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({ submissionKind: 'tryon_result' }),
    consentExcluded: 0,
    composed: { imgbbOnly: 0, blobOnly: 0, blobOnlyOldMirror: 0, both: 0, other: 0 },
    unframed: { blobOnly: 0, imgbbOnly: 0, both: 0, waiting: 0, rejected: 0, keptUnverified: 0 },
    copies: { notMade: 0, couldNotVerify: 0, photosWithAProblem: 0 },
    toDo: { rescue: 0, mirror: 0, unframed: 0, 'unframed-rescue': 0 },
  };
  for await (const rows of pages(db)) {
    for (const row of rows) {
      const c = classify(row);
      if (c.composed !== 'none') plan.pictures += 1;
      const consentEligible = row.consentStatus === 'received' && hasVerifiableConsentAudit(row.consents);
      if (c.composed !== 'none' && !consentEligible) plan.consentExcluded += 1;
      if (c.composed === 'imgbb-only') plan.composed.imgbbOnly += 1;
      else if (c.composed === 'blob-only') {
        plan.composed.blobOnly += 1;
        if (c.oldMirrorRecord) plan.composed.blobOnlyOldMirror += 1;
      } else if (c.composed === 'both') plan.composed.both += 1;
      else if (c.composed === 'other') plan.composed.other += 1;
      if (c.unframed === 'blob-only') plan.unframed.blobOnly += 1;
      else if (c.unframed === 'imgbb-only') plan.unframed.imgbbOnly += 1;
      else if (c.unframed === 'both') plan.unframed.both += 1;
      else if (c.unframed === 'waiting') plan.unframed.waiting += 1;
      else if (c.unframed === 'rejected') plan.unframed.rejected += 1;
      if (c.cropKeptUnverified) plan.unframed.keptUnverified += 1;
      plan.copies.notMade += c.notMade;
      plan.copies.couldNotVerify += c.couldNotVerify;
      if (c.notMade + c.couldNotVerify > 0) plan.copies.photosWithAProblem += 1;
      for (const kind of SAFETY_KINDS) if (consentEligible && needs(kind, row)) plan.toDo[kind] += 1;
    }
  }
  return plan;
}

// ---- the address check (reads only) ---------------------------------------------------------------------------------------------------------------------------------

export const PROBE_BATCH_DEFAULT = 20;
export const PROBE_BATCH_MAX = 40;
const PROBE_CONCURRENT = 4;
const PROBE_BUDGET_MS = 40_000;
const GONE_LISTED = 25;

export interface ProbeBatch {
  /** Photos looked at in this call. */
  processed: number;
  /** Addresses asked, by the answer: it has the file (`ok`), it clearly does not (`gone`), or it could not be told (`unknown`: a timeout, a 5xx, a refusal). */
  addresses: number;
  ok: number;
  gone: number;
  unknown: number;
  /** The addresses that are gone (at most 25 per call). The private unframed crop is named without its address. */
  goneList: Array<{ id: string; what: 'framed picture' | 'copy' | 'unframed crop'; store: string; url: string | null; reason: string }>;
  /** Where to continue (the id of the last photo looked at), or null when the walk is done. */
  next: string | null;
}

/** The addresses a photo names: its framed picture, every recorded copy that has one, and its private unframed file. */
function addressesOf(doc: Document): Array<{ what: 'framed picture' | 'copy' | 'unframed crop'; store: string; url: string }> {
  const seen = new Set<string>();
  const out: Array<{ what: 'framed picture' | 'copy' | 'unframed crop'; store: string; url: string }> = [];
  const add = (what: 'framed picture' | 'copy' | 'unframed crop', url: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ what, store: sideOf(url), url });
  };
  add('framed picture', primaryPicture(doc));
  const review = text((doc.photoReview as Document | undefined)?.photoUrl);
  for (const copy of copiesOf(doc)) {
    // A historical deleted-copy row is not an address that should answer.
    if (copy.state === 'deleted') continue;
    const url = text(copy.url);
    if (url && url === review) add('unframed crop', url);
    else add(copy.role === 'unframed' ? 'unframed crop' : 'copy', url);
  }
  add('unframed crop', review);
  return out;
}

/** One bounded batch of the address check: one-byte range requests, nothing is written, nothing is marked. */
export async function probeImageSafety(
  db: Db,
  options: { after?: ObjectId; limit?: number; budgetMs?: number },
  fetchImpl: typeof fetch = fetch
): Promise<ProbeBatch> {
  const limit = Math.min(PROBE_BATCH_MAX, Math.max(1, Math.floor(options.limit ?? PROBE_BATCH_DEFAULT)));
  const deadline = Date.now() + (options.budgetMs ?? PROBE_BUDGET_MS);
  const result: ProbeBatch = { processed: 0, addresses: 0, ok: 0, gone: 0, unknown: 0, goneList: [], next: null };
  const picked: Document[] = [];
  let reachedEnd = true;
  for await (const rows of pages(db, options.after)) {
    for (const row of rows) {
      if (addressesOf(row).length === 0 || row.consentStatus !== 'received' || !hasVerifiableConsentAudit(row.consents)) continue;
      picked.push(row);
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) {
      reachedEnd = false;
      break;
    }
  }
  let last: Document | null = null;
  for (let i = 0; i < picked.length; i += PROBE_CONCURRENT) {
    if (i > 0 && Date.now() > deadline) {
      reachedEnd = false;
      break;
    }
    const chunk = picked.slice(i, i + PROBE_CONCURRENT);
    const answers = await Promise.all(
      chunk.map(async (row) => Promise.all(addressesOf(row).map(async (address) => ({ row, address, answer: await probeStoredSize(address.url, fetchImpl) }))))
    );
    for (const list of answers) {
      for (const { row, address, answer } of list) {
        result.addresses += 1;
        if (answer.kind === 'size') result.ok += 1;
        else if (answer.kind === 'gone') {
          result.gone += 1;
          if (result.goneList.length < GONE_LISTED) result.goneList.push({ id: String(row._id), what: address.what, store: address.store, url: address.what === 'unframed crop' ? null : address.url, reason: answer.reason });
        } else result.unknown += 1;
      }
    }
    result.processed += chunk.length;
    last = chunk[chunk.length - 1];
  }
  result.next = !reachedEnd && last ? String(last._id) : null;
  return result;
}

// ---- the run (adds only) ----------------------------------------------------------------------------------------------------------------------------------------------

export const RUN_BATCH_DEFAULT = 6;
export const RUN_BATCH_MAX = 12;
const RUN_CONCURRENT = 3;
const RUN_BUDGET_MS = 30_000;
/** A download that takes longer than this is given up (a batch has to fit a 60 second call; an item that fails is simply tried again by the next run). */
const DOWNLOAD_MS = 20_000;
const FAILURES_LISTED = 20;

export interface SafetyDeps extends ImageCopyDeps {
  /** Downloads a picture into memory (bounded). */
  fetchPicture: (url: string) => Promise<Buffer>;
  /** Writes a file to our Blob store under a fixed path (the same bytes written again is not a change). */
  putBlob: (pathname: string, body: Buffer, contentType: string) => Promise<{ url: string }>;
  /** How long a call may keep starting new work. */
  budgetMs: number;
  /** How long one download may take before it is given up. */
  downloadMs: number;
}

export const defaultSafetyDeps: SafetyDeps = {
  ...defaultImageCopyDeps,
  fetchPicture: fetchImageBuffer,
  putBlob: (pathname, body, contentType) => put(pathname, body, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true }),
  budgetMs: RUN_BUDGET_MS,
  downloadMs: DOWNLOAD_MS,
};

export type ItemOutcome = { ok: true; bytes: number } | { ok: false; reason: string; url: string | null };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const safeSegment = (value: unknown) => (typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '') || 'event';

/** The promise's value, or a rejection with `message` after `ms` (the promise itself is left running). */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

/** Downloads a picture and makes sure it is a picture of ours and not the host's "not found" stand-in. */
async function download(url: string, deps: SafetyDeps): Promise<{ buffer: Buffer; format: string }> {
  if (!isAllowedLogoUrl(url)) throw new Error('the address is not on one of our image hosts');
  const buffer = await within(deps.fetchPicture(url), deps.downloadMs, `the host did not send the file within ${deps.downloadMs / 1000} s`);
  if (buffer.length === 0) throw new Error('the host sent an empty file');
  const meta = await sharp(buffer, { failOn: 'none' }).metadata().catch(() => null);
  if (!meta?.format || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) throw new Error('the file is not a picture');
  if (isMissingImagePlaceholder(url, meta.width ?? 0, meta.height ?? 0)) throw new Error('the host sent its "image not found" picture');
  return { buffer, format: meta.format };
}

/** A picture that exists only on ImgBB is copied into our Blob store; the ImgBB side is recorded as read (we just downloaded it). */
async function rescueOne(db: Db, row: Document, deps: SafetyDeps): Promise<ItemOutcome> {
  const id = row._id as ObjectId;
  const url = primaryPicture(row) as string;
  let file: { buffer: Buffer; format: string };
  try {
    file = await download(url, deps);
  } catch (error) {
    const reason = `could not be read from ImgBB: ${message(error)}`;
    await recordFailure(db, id, { role: 'composed', store: 'blob', bytes: null, error: reason }, deps);
    return { ok: false, reason, url };
  }
  const extension = file.format === 'jpeg' ? 'jpg' : file.format;
  let stored: { url: string };
  try {
    stored = await deps.putBlob(`rescue/${safeSegment(row.eventId ?? (Array.isArray(row.eventIds) ? row.eventIds[0] : undefined))}/${String(id)}.${extension}`, file.buffer, `image/${file.format}`);
  } catch (error) {
    const reason = `could not be written to our store: ${message(error)}`;
    await recordFailure(db, id, { role: 'composed', store: 'blob', bytes: file.buffer.length, error: reason }, deps);
    return { ok: false, reason, url };
  }
  const copy = await verifyAndRecord(db, id, { role: 'composed', store: 'blob', url: stored.url, bytes: file.buffer.length }, deps);
  if (copy.state !== 'verified') return { ok: false, reason: copy.error ?? 'the copy could not be read back', url: stored.url };
  const now = deps.now();
  await recordImageCopy(db, id, { role: 'composed', store: 'imgbb', state: 'verified', url, bytes: file.buffer.length, verifiedAt: now, recordedAt: now, error: null });
  return { ok: true, bytes: file.buffer.length };
}

/** A picture that exists only on Blob is copied to ImgBB (read back, address and delete link recorded). */
async function mirrorOne(db: Db, row: Document, deps: SafetyDeps): Promise<ItemOutcome> {
  const id = row._id as ObjectId;
  const url = primaryPicture(row) as string;
  let file: { buffer: Buffer; format: string };
  try {
    file = await download(url, deps);
  } catch (error) {
    const reason = `could not be read from our store: ${message(error)}`;
    await recordFailure(db, id, { role: 'composed', store: 'imgbb', bytes: null, error: reason }, deps);
    return { ok: false, reason, url };
  }
  const now = deps.now();
  await recordImageCopy(db, id, { role: 'composed', store: 'blob', state: 'verified', url, bytes: file.buffer.length, verifiedAt: now, recordedAt: now, error: null });
  const copy = await makeImgbbCopy(db, { submissionId: id, role: 'composed', buffer: file.buffer, name: `composed-${String(id)}` }, deps);
  return copy.state === 'verified' ? { ok: true, bytes: file.buffer.length } : { ok: false, reason: copy.error ?? 'the copy could not be read back', url: copy.url };
}

/** An approved photo's unframed crop is mirrored to ImgBB and both sources are retained. */
async function unframedOne(db: Db, row: Document, deps: SafetyDeps): Promise<ItemOutcome> {
  const id = row._id as ObjectId;
  const url = text((row.photoReview as Document | undefined)?.photoUrl) as string;
  let buffer: Buffer;
  try {
    buffer = (await download(url, deps)).buffer;
  } catch (error) {
    const reason = `the source photo could not be read: ${message(error)}`;
    await recordFailure(db, id, { role: 'unframed', store: 'imgbb', bytes: null, error: reason }, deps);
    return { ok: false, reason, url: null };
  }
  const result = await makeUnframedFinal(db, { submissionId: id, url, buffer }, deps);
  if (!result.mirrored) return { ok: false, reason: result.reason ?? 'the ImgBB copy could not be verified; the source stays in our store', url: null };
  return { ok: true, bytes: buffer.length };
}

/** Restore an approved historical crop from its verified ImgBB backup into Blob without deleting the ImgBB source. */
async function unframedRescueOne(db: Db, row: Document, deps: SafetyDeps): Promise<ItemOutcome> {
  const id = row._id as ObjectId;
  const source = copiesOf(row).find((copy) => copy.role === 'unframed' && copy.store === 'imgbb' && copy.state === 'verified' && text(copy.url));
  const url = text(source?.url);
  if (!url) return { ok: false, reason: 'the verified ImgBB crop address is missing', url: null };
  let file: { buffer: Buffer; format: string };
  try {
    file = await download(url, deps);
  } catch (error) {
    const reason = `the ImgBB crop could not be read: ${message(error)}`;
    await recordFailure(db, id, { role: 'unframed', store: 'blob', bytes: null, error: reason }, deps);
    return { ok: false, reason, url };
  }
  const extension = file.format === 'jpeg' ? 'jpg' : file.format;
  let stored: { url: string };
  try {
    stored = await deps.putBlob(`pending/${safeSegment(row.eventId ?? (Array.isArray(row.eventIds) ? row.eventIds[0] : undefined))}/${String(id)}.${extension}`, file.buffer, `image/${file.format}`);
  } catch (error) {
    const reason = `the crop could not be restored to our store: ${message(error)}`;
    await recordFailure(db, id, { role: 'unframed', store: 'blob', bytes: file.buffer.length, error: reason }, deps);
    return { ok: false, reason, url };
  }
  const copy = await verifyAndRecord(db, id, { role: 'unframed', store: 'blob', url: stored.url, bytes: file.buffer.length }, deps);
  if (copy.state !== 'verified') return { ok: false, reason: copy.error ?? 'the restored crop could not be verified', url: stored.url };
  // Restore the source only if the submission is still approved and the crop field is still empty.
  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: id, reviewStatus: 'approved', 'photoReview.photoUrl': { $in: [null, ''] } },
    { $set: { 'photoReview.photoUrl': stored.url } }
  );
  return { ok: true, bytes: file.buffer.length };
}

const WORKERS: Record<SafetyKind, (db: Db, row: Document, deps: SafetyDeps) => Promise<ItemOutcome>> = {
  rescue: rescueOne,
  mirror: mirrorOne,
  unframed: unframedOne,
  'unframed-rescue': unframedRescueOne,
};

export interface RunBatch {
  kind: SafetyKind;
  /** Photos that needed this kind of copy and were worked on in this call. */
  processed: number;
  /** Photos looked at on the way. */
  scanned: number;
  /** `copied`: the missing copy exists and is verified. `failed`: the copy was not made or could not be verified. */
  counts: { copied: number; failed: number };
  bytes: number;
  /** The photos whose copy was not made, with the reason (at most 20 per call; the rest are only counted). The private unframed crop is never named by its address. */
  failures: Array<{ id: string; reason: string; url: string | null }>;
  /** Where to continue (the id of the last photo worked on), or null when the walk reached the end. */
  next: string | null;
}

/**
 * One bounded batch of one kind, walking the photos by id from `after`: at most `limit` (6 by default, 12) photos, three at a time, and no new work after the time budget.
 * It never throws for a photo: a failure is recorded on the photo and returned.
 */
export async function runImageSafetyBatch(
  db: Db,
  options: { kind: SafetyKind; after?: ObjectId; limit?: number },
  deps: SafetyDeps = defaultSafetyDeps
): Promise<RunBatch> {
  const limit = Math.min(RUN_BATCH_MAX, Math.max(1, Math.floor(options.limit ?? RUN_BATCH_DEFAULT)));
  const deadline = Date.now() + deps.budgetMs;
  const picked: Document[] = [];
  let scanned = 0;
  let reachedEnd = true;
  for await (const rows of pages(db, options.after)) {
    for (const row of rows) {
      scanned += 1;
      if (row.consentStatus === 'received' && hasVerifiableConsentAudit(row.consents) && needs(options.kind, row)) picked.push(row);
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) {
      reachedEnd = false;
      break;
    }
  }
  const result: RunBatch = { kind: options.kind, processed: 0, scanned, counts: { copied: 0, failed: 0 }, bytes: 0, failures: [], next: null };
  let last: Document | null = null;
  for (let i = 0; i < picked.length; i += RUN_CONCURRENT) {
    if (i > 0 && Date.now() > deadline) {
      reachedEnd = false;
      break;
    }
    const chunk = picked.slice(i, i + RUN_CONCURRENT);
    const outcomes = await Promise.all(
      chunk.map(async (row): Promise<ItemOutcome> => {
        try {
          return await WORKERS[options.kind](db, row, deps);
        } catch (error) {
          logWarn('image_safety.item_failed', 'A copy could not be made', { submissionId: String(row._id), kind: options.kind, error: message(error) });
          return { ok: false, reason: message(error), url: null };
        }
      })
    );
    outcomes.forEach((outcome, index) => {
      result.processed += 1;
      if (outcome.ok) {
        result.counts.copied += 1;
        result.bytes += outcome.bytes;
      } else {
        result.counts.failed += 1;
        if (result.failures.length < FAILURES_LISTED) result.failures.push({ id: String(chunk[index]._id), reason: outcome.reason, url: outcome.url });
      }
    });
    last = chunk[chunk.length - 1];
  }
  result.next = !reachedEnd && last ? String(last._id) : null;
  return result;
}
