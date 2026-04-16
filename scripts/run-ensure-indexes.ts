/**
 * Apply recommended MongoDB Atlas indexes for the Camera database.
 *
 * Usage (from repo root):
 *   npm run db:ensure-indexes
 * Loads env from .env and .env.local (see scripts/load-env-from-files.ts). Shell env wins.
 * Requires MONGODB_URI and MONGODB_DB (set in .env or export).
 *
 * After indexes: seeds `fff_settings.sportActivities` in MongoDB when missing (FunFitFan sport dropdown).
 */

import { connectToDatabase, closeConnection } from '../lib/db/mongodb';
import { ensureCameraIndexes } from '../lib/db/ensure-indexes';
import { ensureFunFitFanSportActivitiesInDatabase } from '../lib/funfitfan/bootstrap';
import { loadEnvFromFiles } from './load-env-from-files';

async function main() {
  loadEnvFromFiles();
  try {
    const db = await connectToDatabase();
    const results = await ensureCameraIndexes(db);

    const errors = results.filter((r) => r.status === 'error');
    for (const r of results) {
      const line =
        r.status === 'error'
          ? `✗ ${r.collection}  ${r.detail}`
          : `${r.status === 'exists' ? '○' : '✓'} ${r.collection}  ${r.name}`;
      console.log(line);
    }

    if (errors.length > 0) {
      console.error(`\nFailed on ${errors.length} index(es). Fix duplicates/conflicts and re-run.`);
      process.exitCode = 1;
      return;
    }

    await ensureFunFitFanSportActivitiesInDatabase(db);
    console.log('✓ fff_settings  sportActivities seeded in MongoDB when missing');

    console.log('\nDone.');
  } finally {
    await closeConnection().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
