import { loadEnvFromFiles } from './load-env-from-files';
import { COLLECTIONS } from '@/lib/db/schemas';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import type { ObjectId, WithId } from 'mongodb';

interface RawEvent {
  _id: ObjectId | string;
  eventId?: string;
  notifications?: {
    submissionResultEmailSubject?: unknown;
    submissionResultEmailBody?: unknown;
    submissionResultEmailSubjectAfterSave?: unknown;
    submissionResultEmailBodyAfterSave?: unknown;
    submissionResultEmailSubjectAfterRelatedPhotosReady?: unknown;
    submissionResultEmailBodyAfterRelatedPhotosReady?: unknown;
  };
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

function toTemplateValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function shouldFill(value: unknown): value is null {
  return value === null || value === undefined;
}

function formatEventId(event: WithId<RawEvent>): string {
  const fallback = event.eventId || (typeof event._id === 'string' ? event._id : event._id.toString());
  return fallback;
}

async function main() {
  const { apply } = parseArgs();
  loadEnvFromFiles();

  const db = await connectToDatabase();
  const collection = db.collection<RawEvent>(COLLECTIONS.EVENTS);

  const cursor = collection.find({}, { projection: { eventId: 1, notifications: 1 } });

  const stats: MigrationStats = {
    scanned: 0,
    updated: 0,
    dryRunWouldUpdate: 0,
    unchanged: 0,
  };

  for await (const event of cursor) {
    stats.scanned += 1;

    const notifications = event.notifications;
    if (!notifications) {
      stats.unchanged += 1;
      continue;
    }

    const legacySubject = toTemplateValue(notifications.submissionResultEmailSubject);
    const legacyBody = toTemplateValue(notifications.submissionResultEmailBody);

    if (!legacySubject && !legacyBody) {
      stats.unchanged += 1;
      continue;
    }

    const updateSet: Record<string, unknown> = {};

    if (shouldFill(notifications.submissionResultEmailSubjectAfterSave) && legacySubject) {
      updateSet['notifications.submissionResultEmailSubjectAfterSave'] = legacySubject;
    }

    if (shouldFill(notifications.submissionResultEmailBodyAfterSave) && legacyBody) {
      updateSet['notifications.submissionResultEmailBodyAfterSave'] = legacyBody;
    }

    if (shouldFill(notifications.submissionResultEmailSubjectAfterRelatedPhotosReady) && legacySubject) {
      updateSet['notifications.submissionResultEmailSubjectAfterRelatedPhotosReady'] = legacySubject;
    }

    if (shouldFill(notifications.submissionResultEmailBodyAfterRelatedPhotosReady) && legacyBody) {
      updateSet['notifications.submissionResultEmailBodyAfterRelatedPhotosReady'] = legacyBody;
    }

    if (Object.keys(updateSet).length === 0) {
      stats.unchanged += 1;
      continue;
    }

    const label = `${formatEventId(event)} (Mongo: ${event._id.toString()})`;

    if (!apply) {
      stats.dryRunWouldUpdate += 1;
      console.log('WOULD UPDATE:', label, updateSet);
      continue;
    }

    await collection.updateOne({ _id: event._id }, { $set: updateSet });
    stats.updated += 1;
    console.log('UPDATED:', label);
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
