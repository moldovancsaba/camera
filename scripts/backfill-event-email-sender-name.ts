import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS, generateTimestamp } from '../lib/db/schemas';
import { closeConnection, connectToDatabase } from '../lib/db/mongodb';
import { DEFAULT_SUBMISSION_EMAIL_SENDER_NAME } from '../lib/email/submission-template-defaults';

async function main() {
  loadEnvFromFiles();

  const db = await connectToDatabase();
  const now = generateTimestamp();
  const filter = {
    'notifications.submissionResultEmailEnabled': true,
    $or: [
      { 'notifications.submissionResultEmailSenderName': { $exists: false } },
      { 'notifications.submissionResultEmailSenderName': null },
      { 'notifications.submissionResultEmailSenderName': '' },
      { 'notifications.submissionResultEmailSenderName': { $regex: '^\\s+$' } },
    ],
  };

  const result = await db.collection(COLLECTIONS.EVENTS).updateMany(filter, {
    $set: {
      'notifications.submissionResultEmailSenderName': DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
      updatedAt: now,
    },
  });

  console.log(
    `Updated ${result.modifiedCount}/${result.matchedCount} events with sender name ${DEFAULT_SUBMISSION_EMAIL_SENDER_NAME}`
  );
}

main()
  .catch((error) => {
    console.error(
      'Failed to backfill event sender name:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
