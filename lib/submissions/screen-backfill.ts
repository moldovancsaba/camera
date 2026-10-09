/**
 * The backfill of the screen-sized pictures of existing photos (issue 476, step S7; owner answers 211 b and 219 b): which photos still lack one, and a batch that makes some of them.
 * Shared by `scripts/backfill-screen-pictures.ts` (a dry run needs only the database) and the admin route (which runs on the server with its own Blob credentials, so nobody has to
 * hold a token). A batch is bounded and walks the photos by id, so a photo that cannot be made (a dead old link) is passed over once and never makes the walk loop.
 */

import type { Db, Document, ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureScreenPicture, type ScreenPictureOutcome, type ScreenPictureSubmission } from '@/lib/submissions/screen-picture';

export const SCREEN_BACKFILL_BATCH_DEFAULT = 24;
export const SCREEN_BACKFILL_BATCH_MAX = 48;
const CONCURRENT = 3;

/** The events that have an active slideshow: only their photos can appear on a screen. */
export async function slideshowEventIds(db: Db): Promise<string[]> {
  return (await db.collection(COLLECTIONS.SLIDESHOWS).distinct('eventId', { isActive: { $ne: false } })).filter((value): value is string => typeof value === 'string');
}

/** Photos that can appear on a screen (an event with a slideshow; not archived; not waiting for approval or rejected), with a picture and no screen picture yet; `after` continues the walk past an id. */
export function screenBackfillFilter(events: readonly string[], after?: ObjectId): Document {
  return {
    $and: [
      { $or: [{ eventIds: { $in: [...events] } }, { eventId: { $in: [...events] } }] },
      { $or: [{ imageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }] },
      { screenImageUrl: { $in: [null, ''] } },
      { isArchived: { $ne: true } },
      { reviewStatus: { $nin: ['pending_review', 'rejected'] } },
      ...(after ? [{ _id: { $gt: after } }] : []),
    ],
  };
}

export interface ScreenBackfillStatus {
  /** Photos on slideshow events that still have no screen picture. */
  remaining: number;
  events: number;
}

export async function screenBackfillStatus(db: Db, eventId?: string): Promise<ScreenBackfillStatus> {
  const all = await slideshowEventIds(db);
  const events = eventId ? all.filter((id) => id === eventId) : all;
  if (events.length === 0) return { remaining: 0, events: 0 };
  return { remaining: await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(screenBackfillFilter(events)), events: events.length };
}

export interface ScreenBackfillBatch {
  processed: number;
  counts: Partial<Record<ScreenPictureOutcome, number>>;
  /** Bytes of the full-size photos made smaller, and of the pictures that replace them on the screen. */
  beforeBytes: number;
  afterBytes: number;
  /** Where to continue (the id of the last photo of this batch), or null when the walk is done. */
  next: string | null;
  /** Photos still without a screen picture after this batch (those that failed are among them). */
  remaining: number;
}

export type EnsureScreenPicture = (db: Db, submission: ScreenPictureSubmission) => ReturnType<typeof ensureScreenPicture>;

export async function runScreenBackfillBatch(
  db: Db,
  options: { limit?: number; after?: ObjectId; eventId?: string },
  ensure: EnsureScreenPicture = (database, submission) => ensureScreenPicture(database, submission)
): Promise<ScreenBackfillBatch> {
  const limit = Math.min(SCREEN_BACKFILL_BATCH_MAX, Math.max(1, Math.floor(options.limit ?? SCREEN_BACKFILL_BATCH_DEFAULT)));
  const all = await slideshowEventIds(db);
  const events = options.eventId ? all.filter((id) => id === options.eventId) : all;
  if (events.length === 0) return { processed: 0, counts: {}, beforeBytes: 0, afterBytes: 0, next: null, remaining: 0 };

  const rows = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(screenBackfillFilter(events, options.after))
    .project({ imageUrl: 1, finalImageUrl: 1 })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

  const counts: ScreenBackfillBatch['counts'] = {};
  let beforeBytes = 0;
  let afterBytes = 0;
  for (let i = 0; i < rows.length; i += CONCURRENT) {
    const results = await Promise.all(rows.slice(i, i + CONCURRENT).map((row) => ensure(db, { _id: row._id, imageUrl: row.imageUrl, finalImageUrl: row.finalImageUrl })));
    for (const result of results) {
      counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
      beforeBytes += result.sourceBytes ?? 0;
      afterBytes += result.screenBytes ?? 0;
    }
  }
  const remaining = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(screenBackfillFilter(events));
  return { processed: rows.length, counts, beforeBytes, afterBytes, next: rows.length === limit ? String(rows[rows.length - 1]._id) : null, remaining };
}
