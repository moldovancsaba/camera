/**
 * Backfill utility that generates a smaller `previewImageUrl` for existing submissions
 * that only have a full-size `imageUrl`/`finalImageUrl`. Grid/list pages (greatest-hits,
 * admin galleries, profile, etc.) prefer `previewImageUrl` when set, so this makes those
 * already-uploaded photos load fast without waiting for a future re-upload.
 *
 * Usage:
 *   npx tsx scripts/backfill-preview-image-urls.ts
 *   npx tsx scripts/backfill-preview-image-urls.ts --dry-run
 *   npx tsx scripts/backfill-preview-image-urls.ts --limit=50
 */

import { ObjectId, type Document } from 'mongodb';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { fetchImageBuffer, uploadPreviewVariant } from '@/lib/tryon/frame-composition';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { loadEnvFromFiles } from './load-env-from-files';
import { nowIso } from '@/lib/tryon/time';

interface BackfillOptions {
  dryRun: boolean;
  limit: number | null;
}

interface BackfillCandidate {
  _id: ObjectId;
  imageUrl?: string | null;
  finalImageUrl?: string | null;
}

// Polite pacing between imgbb uploads so a large backfill doesn't hammer the free-tier API.
const DELAY_BETWEEN_UPLOADS_MS = 250;

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const limitArg = args.find((value) => value.startsWith('--limit='));
  const rawLimit = limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : NaN;
  return {
    dryRun: args.includes('--dry-run'),
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadEnvFromFiles();
  const options = parseArgs();

  const db = await connectToDatabase();
  let updated = 0;
  let failed = 0;

  try {
    const filter: Document = {
      previewImageUrl: { $in: [null, undefined] },
      $or: [{ imageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }],
    };

    const cursor = db
      .collection<BackfillCandidate>(COLLECTIONS.SUBMISSIONS)
      .find(filter)
      .project({ imageUrl: 1, finalImageUrl: 1 });

    const candidates = options.limit ? await cursor.limit(options.limit).toArray() : await cursor.toArray();
    console.log(`Found ${candidates.length} submissions missing previewImageUrl`);

    for (const candidate of candidates) {
      const sourceUrl = candidate.finalImageUrl || candidate.imageUrl;
      const submissionId = candidate._id.toString();

      if (!sourceUrl) {
        console.log(`⏭️  [${submissionId}] no source image, skipping`);
        continue;
      }

      try {
        const buffer = await fetchImageBuffer(sourceUrl);
        const previewUrl = await uploadPreviewVariant(buffer, `backfill-preview-${submissionId}`);

        if (!previewUrl) {
          console.log(`⏭️  [${submissionId}] preview generation failed, leaving full-size fallback in place`);
          continue;
        }

        if (!options.dryRun) {
          await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
            { _id: candidate._id },
            { $set: { previewImageUrl: previewUrl, updatedAt: nowIso() } }
          );
        }

        updated += 1;
        console.log(`✅ [${submissionId}] ${options.dryRun ? 'DRY' : 'UPDATED'} -> ${previewUrl}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ [${submissionId}] failed:`, message);
      }

      await sleep(DELAY_BETWEEN_UPLOADS_MS);
    }

    console.log('\nSummary:');
    console.log(`  Total:   ${candidates.length}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Dry-run: ${options.dryRun ? 'yes' : 'no'}`);
  } finally {
    await closeConnection();
  }
}

main().catch(async (error: unknown) => {
  console.error('Failed to backfill preview image URLs:', error);
  await closeConnection().catch(() => {});
  process.exitCode = 1;
});
