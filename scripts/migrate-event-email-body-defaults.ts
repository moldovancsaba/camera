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
  partnerName?: string;
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

const MOTOGP_SUBMISSION_EMAIL_BODY = `Hi {name},

Thank you for enjoying the MotoGP Leather Magic experience at {event}.

Your amazing rider photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}`;

const MOTOGP_TRYON_RESUBMISSION_EMAIL_BODY = `Hi {name},

Thank you for enjoying the MotoGP Leather Magic experience at {event}.

Your updated rider photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}`;

function isMotoGpEvent(event: RawEvent): boolean {
  const values = [event.name, event.partnerName]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());

  return values.some((value) => value.includes('motogp') || value.includes('moto gp'));
}

function buildUpdateSet(event: RawEvent): Record<string, unknown> {
  const notifications = event.notifications && typeof event.notifications === 'object'
    ? event.notifications
    : {};
  const submissionBody = isMotoGpEvent(event)
    ? MOTOGP_SUBMISSION_EMAIL_BODY
    : DEFAULT_SUBMISSION_EMAIL_BODY;
  const tryOnResubmissionBody = isMotoGpEvent(event)
    ? MOTOGP_TRYON_RESUBMISSION_EMAIL_BODY
    : DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY;

  const updateSet: Record<string, unknown> = {};
  const bodyFields = {
    'notifications.submissionResultEmailBody': submissionBody,
    'notifications.submissionResultEmailBodyAfterSave': submissionBody,
    'notifications.submissionResultEmailBodyAfterRelatedPhotosReady': submissionBody,
    'notifications.submissionResultEmailBodyAfterTryOnResubmissionApproved': tryOnResubmissionBody,
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
  const cursor = collection.find({}, { projection: { eventId: 1, name: 1, partnerName: 1, notifications: 1 } });

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
