import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS } from '@/lib/db/schemas';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import {
  DEFAULT_EVENT_TERMS_URL,
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
} from '@/lib/email/submission-template-defaults';
import type { ObjectId, WithId } from 'mongodb';

interface RawEvent {
  _id: ObjectId | string;
  eventId?: string;
  name?: string;
  notifications?: Record<string, unknown>;
}

interface MigrationStats {
  scanned: number;
  updated: number;
  dryRunWouldUpdate: number;
  unchanged: number;
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
  };
}

function formatEventLabel(event: WithId<RawEvent>): string {
  const publicId = typeof event.eventId === 'string' && event.eventId.trim() ? event.eventId.trim() : null;
  const name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : null;
  return `${name ?? 'Untitled event'} (${publicId ?? event._id.toString()})`;
}

function buildUpdateSet(event: RawEvent): Record<string, unknown> {
  const notifications = event.notifications && typeof event.notifications === 'object'
    ? event.notifications
    : {};

  const updateSet: Record<string, unknown> = {};
  const bodyFields = {
    'notifications.submissionResultEmailBody': DEFAULT_SUBMISSION_EMAIL_BODY,
    'notifications.submissionResultEmailBodyAfterSave': DEFAULT_SUBMISSION_EMAIL_BODY,
    'notifications.submissionResultEmailBodyAfterRelatedPhotosReady': DEFAULT_SUBMISSION_EMAIL_BODY,
    'notifications.submissionResultEmailBodyAfterTryOnResubmissionApproved': DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
    'notifications.termsUrl': DEFAULT_EVENT_TERMS_URL,
  };

  for (const [path, nextValue] of Object.entries(bodyFields)) {
    const key = path.replace('notifications.', '');
    if (notifications[key] !== nextValue) {
      updateSet[path] = nextValue;
    }
  }

  return updateSet;
}

async function main() {
  const { apply } = parseArgs();
  loadEnvFromFiles();

  const db = await connectToDatabase();
  const collection = db.collection<RawEvent>(COLLECTIONS.EVENTS);
  const cursor = collection.find({}, { projection: { eventId: 1, name: 1, notifications: 1 } });

  const stats: MigrationStats = {
    scanned: 0,
    updated: 0,
    dryRunWouldUpdate: 0,
    unchanged: 0,
  };

  for await (const event of cursor) {
    stats.scanned += 1;
    const updateSet = buildUpdateSet(event);

    if (Object.keys(updateSet).length === 0) {
      stats.unchanged += 1;
      continue;
    }

    if (!apply) {
      stats.dryRunWouldUpdate += 1;
      console.log('WOULD UPDATE:', formatEventLabel(event));
      continue;
    }

    await collection.updateOne({ _id: event._id }, { $set: updateSet });
    stats.updated += 1;
    console.log('UPDATED:', formatEventLabel(event));
  }

  if (!apply) {
    console.log(`
Dry-run complete.
Scanned: ${stats.scanned}
Would update: ${stats.dryRunWouldUpdate}
Unchanged: ${stats.unchanged}
`);
    console.log('Use --apply to write changes.');
  } else {
    console.log(`
Migration complete.
Scanned: ${stats.scanned}
Updated: ${stats.updated}
Unchanged: ${stats.unchanged}
`);
  }

  await closeConnection();
}

main().catch(async (error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : String(error));
  await closeConnection().catch(() => {});
  process.exitCode = 1;
});
