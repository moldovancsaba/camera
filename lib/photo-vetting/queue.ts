/**
 * What the moderation queue shows for an event (camera#268, docs/PHOTO_VETTING_PLAN.md): the photos of vetted events grouped by
 * review status, oldest waiting first. Only photos that went through vetting (they carry `photoReview`) are listed; photos made before
 * vetting, and try-on results, have their own screens.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export type QueueStatus = 'pending_review' | 'rejected' | 'approved';

export const QUEUE_STATUSES: readonly QueueStatus[] = ['pending_review', 'rejected', 'approved'];

export const isQueueStatus = (value: unknown): value is QueueStatus => typeof value === 'string' && (QUEUE_STATUSES as readonly string[]).includes(value);

export interface PhotoQueueItem {
  id: string;
  status: QueueStatus;
  createdAt: string;
  name: string;
  email: string | null;
  /** The plain photo while waiting or rejected (private, for moderators only), the real picture once approved. */
  photoUrl: string | null;
  frameKind: 'generated' | 'own' | 'none';
  shareOptIn: boolean;
  tryOnRequested: boolean;
  last: { action: 'approve' | 'reject'; by: string; at: string; reason: string | null } | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function toPhotoQueueItem(doc: Document): PhotoQueueItem {
  const status: QueueStatus = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review';
  const review = (doc.photoReview ?? {}) as Document;
  const history = Array.isArray(doc.reviewHistory) ? (doc.reviewHistory as Document[]) : [];
  const last = history[history.length - 1];
  const name = text(doc.userInfo?.name) ?? text(doc.userName) ?? 'Guest';
  return {
    id: String(doc._id),
    status,
    createdAt: text(doc.createdAt) ?? '',
    name,
    email: text(doc.userInfo?.email),
    photoUrl: status === 'approved' ? text(doc.imageUrl) : text(review.photoUrl),
    frameKind: doc.frameVariant ? 'generated' : doc.frameId ? 'own' : 'none',
    shareOptIn: review.shareOptIn === true,
    tryOnRequested: Boolean(doc.tryOnRequest?.requested) || Boolean(review.tryOn),
    last:
      last && (last.action === 'approve' || last.action === 'reject')
        ? { action: last.action, by: text(last.by) ?? 'unknown', at: text(last.at) ?? '', reason: text(last.reason) }
        : null,
  };
}

export function queueFilter(eventUuid: string, status: QueueStatus): Document {
  return {
    $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }],
    photoReview: { $exists: true },
    reviewStatus: status,
    isArchived: { $ne: true },
  };
}

export async function loadPhotoQueue(db: Db, eventUuid: string, status: QueueStatus, limit = 60): Promise<PhotoQueueItem[]> {
  // The waiting list is worked oldest first; the decided lists show the latest decisions first.
  const docs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(queueFilter(eventUuid, status))
    .sort({ createdAt: status === 'pending_review' ? 1 : -1 })
    .limit(limit)
    .toArray();
  return docs.map(toPhotoQueueItem);
}

export async function countPhotoQueue(db: Db, eventUuid: string): Promise<Record<QueueStatus, number>> {
  const counts = await Promise.all(QUEUE_STATUSES.map((status) => db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(queueFilter(eventUuid, status))));
  return { pending_review: counts[0], rejected: counts[1], approved: counts[2] };
}
