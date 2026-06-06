import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS } from '@/lib/db/schemas';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { DEFAULT_EVENT_TERMS_URL } from '@/lib/email/submission-template-defaults';

async function main() {
  loadEnvFromFiles();

  const db = await connectToDatabase();
  const result = await db.collection(COLLECTIONS.EVENTS).updateMany(
    {},
    {
      $set: {
        'notifications.termsUrl': DEFAULT_EVENT_TERMS_URL,
      },
    }
  );

  console.log(
    `Updated ${result.modifiedCount}/${result.matchedCount} events with terms URL ${DEFAULT_EVENT_TERMS_URL}`
  );
}

main()
  .catch((error) => {
    console.error('Failed to backfill event terms URL:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
