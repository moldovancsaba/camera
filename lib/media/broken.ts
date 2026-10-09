/**
 * Pictures that are gone, and the one rule about them (owner, 2026-10-09): **a picture that cannot be shown is hidden, never shown as an error** — on the slideshow, in every gallery, on
 * the share page, in the feeds, for any item. A host that has lost a file answers 404 (ImgBB also sends a 180 x 180 "image not found" PNG with that 404, which a browser draws like a
 * photo), so the hiding cannot be left to the browser: the server checks the address itself and records `mediaHealth` on the submission; the one visibility rule
 * (lib/submissions/visibility.ts) and the playlist and gallery queries leave a broken one out. A check that cannot tell (timeout, 5xx, a refusal) never marks anything: only a clear
 * "gone" does, and a picture that answers again is cleared at the next check. Server side.
 */

import type { Db, Document, ObjectId } from 'mongodb';
import { ObjectId as Oid } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isAllowedLogoUrl } from '@/lib/frame/logo';

export type PictureCheck = 'ok' | 'broken' | 'unknown';

export interface MediaHealth {
  broken: boolean;
  /** Why it is broken (`the picture is gone (http 404)`), absent when it is fine. */
  reason?: string;
  checkedAt: string;
}

const CHECK_TIMEOUT_MS = 10_000;

/**
 * One address: `broken` only when the host clearly does not have the picture (404, 410, or an answer that is not an image), `ok` when it answers with an image, `unknown` for anything
 * else (a timeout, a server error, a refusal, an address that is not one of our image hosts). A one-byte range is asked for, so no picture is downloaded.
 */
export async function checkPicture(url: string, fetchImpl: typeof fetch = fetch): Promise<PictureCheck> {
  if (!isAllowedLogoUrl(url)) return 'unknown';
  try {
    const res = await fetchImpl(url, { headers: { Range: 'bytes=0-0', Accept: 'image/*' }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), redirect: 'follow' });
    if (res.status === 404 || res.status === 410) return 'broken';
    if (res.status === 200 || res.status === 206) return (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/') ? 'ok' : 'broken';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The picture the public sees of a submission: the framed or final one, else the plain one. */
export function publicPictureOf(submission: Document): string | null {
  for (const key of ['finalImageUrl', 'imageUrl'] as const) {
    const value = submission[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export type Outcome = 'marked' | 'cleared' | 'fine' | 'unknown' | 'no-picture';

/** Checks the picture of one submission and records what it found: broken is marked, a picture that answers again clears an older mark, an unclear answer changes nothing. */
export async function verifySubmission(db: Db, submission: Document, now: string, check: (url: string) => Promise<PictureCheck> = checkPicture): Promise<Outcome> {
  const url = publicPictureOf(submission);
  if (!url) return 'no-picture';
  const result = await check(url);
  if (result === 'unknown') return 'unknown';
  const was = (submission.mediaHealth as MediaHealth | undefined)?.broken === true;
  if (result === 'broken') {
    const health: MediaHealth = { broken: true, reason: 'the picture is gone (http 404)', checkedAt: now };
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { mediaHealth: health } });
    return 'marked';
  }
  const health: MediaHealth = { broken: false, checkedAt: now };
  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { mediaHealth: health } });
  return was ? 'cleared' : 'fine';
}

/** A report from a screen that could not load a picture: the server looks for itself (it never takes the screen's word for it) and records what it finds. */
export async function reportBroken(db: Db, submissionId: unknown, now: string, check?: (url: string) => Promise<PictureCheck>): Promise<Outcome | 'not-found'> {
  if (typeof submissionId !== 'string' || !Oid.isValid(submissionId)) return 'not-found';
  const submission = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new Oid(submissionId) }, { projection: { imageUrl: 1, finalImageUrl: 1, mediaHealth: 1 } });
  if (!submission) return 'not-found';
  // A fresh answer is not asked for again at once: a screen that reports every slide must not make us ask the host for every slide.
  const health = submission.mediaHealth as MediaHealth | undefined;
  if (health && Date.parse(now) - Date.parse(health.checkedAt) < 60_000) return health.broken ? 'marked' : 'fine';
  return verifySubmission(db, submission, now, check);
}

export interface ScanBatch {
  processed: number;
  counts: Partial<Record<Outcome, number>>;
  next: string | null;
  /** Photos not checked in the last `maxAgeDays` days, after this batch. */
  remaining: number;
}

export const SCAN_BATCH_DEFAULT = 40;
export const SCAN_BATCH_MAX = 80;
const CONCURRENT = 4;

/** Photos with a picture that have not been checked in the last `maxAgeDays` days (or never); `after` continues the walk past an id. */
export function scanFilter(maxAgeDays: number, now: Date, after?: ObjectId): Document {
  const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
  return {
    $and: [
      { $or: [{ imageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }] },
      { $or: [{ 'mediaHealth.checkedAt': { $exists: false } }, { 'mediaHealth.checkedAt': { $lt: cutoff } }] },
      { isArchived: { $ne: true } },
      ...(after ? [{ _id: { $gt: after } }] : []),
    ],
  };
}

/** One bounded batch of the scan, by id, so a picture that cannot be told is passed once and the walk always ends. */
export async function scanBatch(
  db: Db,
  options: { limit?: number; after?: ObjectId; maxAgeDays?: number; now?: Date },
  check?: (url: string) => Promise<PictureCheck>
): Promise<ScanBatch> {
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? 7;
  const limit = Math.min(SCAN_BATCH_MAX, Math.max(1, Math.floor(options.limit ?? SCAN_BATCH_DEFAULT)));
  const rows = await db.collection(COLLECTIONS.SUBMISSIONS).find(scanFilter(maxAgeDays, now, options.after)).project({ imageUrl: 1, finalImageUrl: 1, mediaHealth: 1 }).sort({ _id: 1 }).limit(limit).toArray();
  const counts: ScanBatch['counts'] = {};
  for (let i = 0; i < rows.length; i += CONCURRENT) {
    const outcomes = await Promise.all(rows.slice(i, i + CONCURRENT).map((row) => verifySubmission(db, row, now.toISOString(), check)));
    for (const outcome of outcomes) counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  const remaining = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(scanFilter(maxAgeDays, now));
  return { processed: rows.length, counts, next: rows.length === limit ? String(rows[rows.length - 1]._id) : null, remaining };
}

/** Photos of an event that are marked broken right now (the gallery says how many it hides). */
export async function countBroken(db: Db, eventKeys: readonly string[]): Promise<number> {
  return db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({ 'mediaHealth.broken': true, isArchived: { $ne: true }, $or: [{ eventId: { $in: [...eventKeys] } }, { eventIds: { $in: [...eventKeys] } }] });
}
