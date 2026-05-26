import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { upsertLeatherSuitsFromSeed, type LeatherSuitSeed } from '@/lib/tryon/suits';
import { loadEnvFromFiles } from './load-env-from-files';

async function main() {
  loadEnvFromFiles();

  const explicit = process.argv[2]?.trim();
  const seedPath = explicit || process.env.TRYON_SUIT_SEED_FILE?.trim() || 'config/leather-suits.example.json';
  const absoluteSeedPath = path.isAbsolute(seedPath) ? seedPath : path.join(process.cwd(), seedPath);
  const raw = await readFile(absoluteSeedPath, 'utf8');
  const parsed = JSON.parse(raw) as LeatherSuitSeed[];

  if (!Array.isArray(parsed)) {
    throw new Error('Try-on suit seed file must contain a JSON array');
  }

  const db = await connectToDatabase();
  const count = await upsertLeatherSuitsFromSeed(db, parsed);
  console.log(`Seeded ${count} leather suits from ${absoluteSeedPath}`);
  await closeConnection().catch(() => {});
}

main().catch((error: unknown) => {
  console.error('Failed to seed try-on suits', error);
  process.exitCode = 1;
});
