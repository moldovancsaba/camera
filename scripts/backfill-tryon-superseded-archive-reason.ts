import { loadEnvFromFiles } from './load-env-from-files';
import { connectToDatabase, closeConnection } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';

async function main() {
  loadEnvFromFiles();
  const apply = process.argv.includes('--apply');
  const db = await connectToDatabase();
  const docs = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({
    submissionKind: 'tryon_result',
    $or: [
      { 'metadata.tryOnSupersededByRerun': true },
      { 'metadata.tryOnSupersededByJobId': { $type: 'string' } },
    ],
    $and: [
      {
        $or: [
          { 'tryOnModerationArchive.reason': { $exists: false } },
          { 'tryOnModerationArchive.reason': null },
        ],
      },
    ],
  }).toArray();

  let patched = 0;
  for (const doc of docs) {
    const metadata = doc.metadata as Record<string, unknown> | undefined;
    const supersededByJobId =
      typeof metadata?.tryOnSupersededByJobId === 'string' ? metadata.tryOnSupersededByJobId : null;
    const supersededAt =
      typeof metadata?.tryOnSupersededAt === 'string' ? metadata.tryOnSupersededAt : doc.updatedAt;
    const patch = {
      'tryOnModerationArchive.archived': true,
      'tryOnModerationArchive.bucket': 'rejected',
      'tryOnModerationArchive.reason': 'quality_rerun_superseded',
      'tryOnModerationArchive.supersededByJobId': supersededByJobId,
      'tryOnModerationArchive.supersededAt': supersededAt,
      updatedAt: new Date().toISOString(),
    };
    if (apply && doc._id) {
      const result = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: doc._id },
        { $set: patch }
      );
      if (result.modifiedCount > 0) patched += 1;
    } else {
      patched += 1;
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidates: docs.length, patched }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
