import { ObjectId, type Filter } from 'mongodb';

import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS } from '@/lib/db/schemas';

interface Options {
  dryRun: boolean;
  eventId?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--event-id=')) {
      const value = arg.split('=', 2)[1]?.trim();
      if (value) {
        options.eventId = value;
      }
    }
  }
  return options;
}

function buildEventFilter(
  eventId?: string
): Filter<Record<string, unknown>> {
  const filter: Record<string, unknown> = {
    frames: { $exists: true, $type: 'array', $ne: [] },
    'tryOn.applyFrameToReturnedResults': { $ne: true },
  };

  if (!eventId) {
    return filter;
  }

  const filters: Array<Record<string, unknown>> = [{ eventId: eventId }];
  if (ObjectId.isValid(eventId)) {
    filters.push({ _id: new ObjectId(eventId) });
  }
  return {
    ...filter,
    $or: filters,
  };
}

async function main() {
  loadEnvFromFiles();

  const options = parseOptions(process.argv.slice(2));
  const dbUri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB?.trim();
  if (!dbUri) {
    throw new Error('MONGODB_URI is required.');
  }
  if (!dbName) {
    throw new Error('MONGODB_DB is required.');
  }

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(dbUri, {
    maxPoolSize: 5,
    minPoolSize: 0,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    const filter = buildEventFilter(options.eventId);

    const matching = await db.collection(COLLECTIONS.EVENTS).countDocuments(filter);
    if (options.dryRun) {
      console.log(`[dry-run] Matching events to update: ${matching}`);
      return;
    }

    if (matching === 0) {
      console.log('No events matched. No updates needed.');
      return;
    }

    const result = await db.collection(COLLECTIONS.EVENTS).updateMany(filter, {
      $set: {
        'tryOn.applyFrameToReturnedResults': true,
      },
    });

    console.log(`Updated ${result.modifiedCount}/${result.matchedCount} events to enable try-on frame composition.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Failed to enable try-on frame composition:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

