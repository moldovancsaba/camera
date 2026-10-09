/**
 * Backfill of the screen-sized pictures of existing photos (camera#476, step S7; owner answer 211 b: new photos and a backfill, dry run first, the owner gives the go).
 *
 * A screen picture is a WebP of at most 1920 px on the longest edge, stored as `screen-pictures/<id>.webp` in the Blob store and named in `Submission.screenImageUrl`
 * (lib/submissions/screen-picture.ts). The playlist sends it to the giant screen instead of the full-size photo. The original file and its fields are never changed.
 *
 * The default is a DRY RUN: it counts what would be made, per event, and with `--measure=N` downloads N sample photos to measure the real saving. It writes nothing,
 * not even to the database. Only `--apply` uploads and writes.
 *
 * Which photos: submissions that can appear on a screen (an event that has a slideshow; not archived; not waiting for approval or rejected) with a picture and no
 * screen picture yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-screen-pictures.ts                       # dry run, counts per event
 *   npx tsx scripts/backfill-screen-pictures.ts --measure=12          # dry run, and measure 12 sample photos
 *   npx tsx scripts/backfill-screen-pictures.ts --event=<event uuid>  # one event only
 *   npx tsx scripts/backfill-screen-pictures.ts --apply --event=<uuid> [--limit=200]   # makes them (needs BLOB_READ_WRITE_TOKEN)
 */

import type { Document } from 'mongodb';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureScreenPicture } from '@/lib/submissions/screen-picture';
import { loadEnvFromFiles } from './load-env-from-files';

const arg = (name: string): string | undefined => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.slice(2).includes(`--${name}`);
const mb = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`;

async function main() {
  loadEnvFromFiles();
  const apply = flag('apply');
  const only = arg('event');
  const limit = Number.parseInt(arg('limit') ?? '', 10);
  const measure = Number.parseInt(arg('measure') ?? '', 10);
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error('--apply needs BLOB_READ_WRITE_TOKEN');

  const db = await connectToDatabase();
  const slideshowEvents = (await db.collection(COLLECTIONS.SLIDESHOWS).distinct('eventId', { isActive: { $ne: false } })).filter((v): v is string => typeof v === 'string');
  const events = only ? slideshowEvents.filter((id) => id === only) : slideshowEvents;
  if (events.length === 0) {
    console.log(only ? `No slideshow belongs to event ${only}.` : 'No slideshows.');
    return;
  }

  const filter: Document = {
    $and: [
      { $or: [{ eventIds: { $in: events } }, { eventId: { $in: events } }] },
      { $or: [{ imageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }] },
      { screenImageUrl: { $in: [null, ''] } },
      { isArchived: { $ne: true } },
      { reviewStatus: { $nin: ['pending_review', 'rejected'] } },
    ],
  };
  const rows = await db.collection(COLLECTIONS.SUBMISSIONS).find(filter).project({ imageUrl: 1, finalImageUrl: 1, eventId: 1, eventName: 1, fileSize: 1, mimeType: 1, submissionKind: 1 }).sort({ createdAt: -1 }).toArray();

  const perEvent = new Map<string, { name: string; count: number; bytes: number; png: number }>();
  for (const r of rows) {
    const key = String(r.eventId ?? '');
    const e = perEvent.get(key) ?? { name: String(r.eventName ?? key), count: 0, bytes: 0, png: 0 };
    e.count += 1;
    e.bytes += typeof r.fileSize === 'number' ? r.fileSize : 0;
    if (r.mimeType === 'image/png') e.png += 1;
    perEvent.set(key, e);
  }
  console.log(`${apply ? 'APPLY' : 'DRY RUN (nothing is written)'}: ${rows.length} photos on ${events.length} slideshow event(s) have no screen picture yet`);
  let totalBytes = 0;
  for (const [id, e] of [...perEvent].sort((a, b) => b[1].count - a[1].count)) {
    totalBytes += e.bytes;
    console.log(`  ${e.name.slice(0, 48).padEnd(48)} ${String(e.count).padStart(5)} photos  ${mb(e.bytes).padStart(9)} stored  ${e.png ? `${e.png} PNG  ` : ''}(${id.slice(0, 8)})`);
  }
  console.log(`  total stored size of those photos (database field): ${mb(totalBytes)}`);

  if (!apply && Number.isFinite(measure) && measure > 0) {
    const sample = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / measure)) === 0).slice(0, measure);
    let before = 0;
    let after = 0;
    let made = 0;
    for (const r of sample) {
      const result = await ensureScreenPicture(db, { _id: r._id, imageUrl: r.imageUrl, finalImageUrl: r.finalImageUrl }, undefined, { dryRun: true });
      if (result.sourceBytes && result.screenBytes) {
        before += result.sourceBytes;
        after += result.screenBytes;
        made += result.outcome === 'made' ? 1 : 0;
      }
    }
    if (before > 0) console.log(`  measured on ${sample.length} sample photos: ${mb(before)} -> ${mb(after)} (${Math.round((after / before) * 100)} % of the size; ${made} would get a new file, the rest are already small)`);
  }

  if (apply) {
    const todo = Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;
    const counts: Record<string, number> = {};
    let before = 0;
    let after = 0;
    for (let i = 0; i < todo.length; i += 3) {
      const results = await Promise.all(todo.slice(i, i + 3).map((r) => ensureScreenPicture(db, { _id: r._id, imageUrl: r.imageUrl, finalImageUrl: r.finalImageUrl })));
      for (const result of results) {
        counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
        before += result.sourceBytes ?? 0;
        after += result.screenBytes ?? 0;
      }
      if ((i / 3) % 10 === 0) console.log(`  ${Math.min(i + 3, todo.length)} / ${todo.length}`);
    }
    console.log(`Done: ${JSON.stringify(counts)}; ${mb(before)} -> ${mb(after)}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Backfill of the screen pictures failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closeConnection().catch(() => undefined));
