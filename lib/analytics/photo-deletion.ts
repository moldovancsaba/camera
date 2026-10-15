import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/** Keep only the event and photo outcome needed for counts when a submission is permanently deleted. */
export async function recordManualPhotoDeletion(db: Db, submission: Document, deletedAt = new Date().toISOString()): Promise<void> {
  const metadata = submission.metadata && typeof submission.metadata === 'object' ? submission.metadata as Record<string, unknown> : {};
  const eventIds = new Set<string>();
  if (typeof submission.eventId === 'string' && submission.eventId) eventIds.add(submission.eventId);
  if (Array.isArray(submission.eventIds)) for (const id of submission.eventIds) if (typeof id === 'string' && id) eventIds.add(id);
  if (Array.isArray(submission.hiddenFromEvents)) for (const id of submission.hiddenFromEvents) if (typeof id === 'string' && id) eventIds.add(id);
  if (!submission._id || eventIds.size === 0) return;

  const submissions = db.collection(COLLECTIONS.PHOTO_DELETION_ANALYTICS);
  for (const eventId of eventIds) {
    const submissionId = String(submission._id);
    await submissions.updateOne(
      { _id: `${eventId}:${submissionId}` } as never,
      {
        $setOnInsert: {
          eventId,
          submissionId,
          kind: 'manual',
          deletedAt,
          createdAt: typeof submission.createdAt === 'string' ? submission.createdAt : deletedAt,
          reviewStatus: submission.reviewStatus ?? null,
          identityStatus: metadata.identityStatus === 'REGISTERED' ? 'REGISTERED' : 'NO USER',
          method: submission.method ?? null,
          deviceClass: metadata.deviceClass ?? null,
        },
      },
      { upsert: true },
    );
  }
}
