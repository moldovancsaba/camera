/**
 * Finds the photos whose picture is gone and hides them everywhere (lib/media/broken.ts; owner, 2026-10-09: a picture that cannot be shown is hidden, never shown as an error).
 *
 * A DRY RUN by default: it asks each picture's own host (a one-byte range request, nothing is downloaded) and prints what it would mark; it writes nothing. `--apply` records `mediaHealth`
 * on the photos (the only write: no picture is deleted or changed). Only a clear "gone" (404, 410, not an image) marks a photo; a timeout or a server error leaves it as it was.
 *
 * Usage:
 *   npx tsx scripts/scan-broken-pictures.ts                  # dry run over the photos not checked this week
 *   npx tsx scripts/scan-broken-pictures.ts --all            # dry run over every photo, whatever it was last checked
 *   npx tsx scripts/scan-broken-pictures.ts --apply [--all]  # records the result (the admin button on the Slideshows page does the same)
 */

import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { checkPicture, publicPictureOf, scanBatch, scanFilter } from '@/lib/media/broken';
import { loadEnvFromFiles } from './load-env-from-files';

const flag = (name: string): boolean => process.argv.slice(2).includes(`--${name}`);

async function main() {
  loadEnvFromFiles();
  const apply = flag('apply');
  const maxAgeDays = flag('all') ? 0 : 7;
  const db = await connectToDatabase();
  const now = new Date();

  if (!apply) {
    const rows = await db.collection(COLLECTIONS.SUBMISSIONS).find(scanFilter(maxAgeDays, now)).project({ imageUrl: 1, finalImageUrl: 1, eventName: 1, mediaHealth: 1 }).sort({ _id: 1 }).toArray();
    console.log(`DRY RUN (nothing is written): checking ${rows.length} pictures…`);
    const gone: Array<{ id: string; event: string; url: string }> = [];
    let unknown = 0;
    for (let i = 0; i < rows.length; i += 6) {
      const results = await Promise.all(rows.slice(i, i + 6).map(async (row) => ({ row, result: await checkPicture(publicPictureOf(row) ?? '') })));
      for (const { row, result } of results) {
        if (result === 'broken') gone.push({ id: String(row._id), event: String(row.eventName ?? ''), url: publicPictureOf(row) ?? '' });
        if (result === 'unknown') unknown += 1;
      }
    }
    console.log(`${gone.length} gone, ${unknown} could not be told, ${rows.length - gone.length - unknown} fine.`);
    for (const g of gone) console.log(`  ${g.id}  ${g.event.slice(0, 32).padEnd(32)} ${g.url}`);
    return;
  }

  console.log(`APPLY: checking and recording (every photo not checked in the last ${maxAgeDays || 0} days)…`);
  let after: Parameters<typeof scanBatch>[1]['after'];
  const totals: Record<string, number> = {};
  for (;;) {
    const batch = await scanBatch(db, { after, maxAgeDays, now });
    for (const [k, v] of Object.entries(batch.counts)) totals[k] = (totals[k] ?? 0) + (v ?? 0);
    console.log(`  ${batch.processed} checked; ${batch.remaining} left`);
    if (!batch.next) break;
    const { ObjectId } = await import('mongodb');
    after = new ObjectId(batch.next);
  }
  console.log(`Done: ${JSON.stringify(totals)}`);
}

main()
  .catch((error: unknown) => {
    console.error('The scan of the pictures failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closeConnection().catch(() => undefined));
