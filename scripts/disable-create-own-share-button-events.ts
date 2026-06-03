import { MongoClient } from 'mongodb';

import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS } from '@/lib/db/schemas';

loadEnvFromFiles();

const dbUri = process.env.MONGODB_URI?.trim();
if (!dbUri) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB?.trim();
if (!dbName) {
  console.error('MONGODB_DB is required.');
  process.exit(1);
}

const client = new MongoClient(dbUri, {
  maxPoolSize: 5,
  minPoolSize: 0,
});

try {
  await client.connect();
  const db = client.db(dbName);
  const result = await db.collection(COLLECTIONS.EVENTS).updateMany(
    {},
    {
      $set: {
        'sharePage.showCreateYourOwnButton': false,
      },
    }
  );

  console.log(
    `Updated ${result.modifiedCount}/${result.matchedCount} events to disable share-page Create Your Own button.`
  );
} catch (error) {
  console.error('Failed to migrate events:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.close();
}
