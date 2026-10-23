/**
 * What the moderation queue shows for an event (camera#268, docs/PHOTO_VETTING_PLAN.md): the photos of vetted events grouped by
 * review status, oldest waiting first. Only photos that went through vetting (they carry `photoReview`) are listed; photos made before
 * vetting, have their own screens.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CONSENT_ELIGIBLE_FILTER, CONSENT_PENDING_FILTER, CONSENT_UNKNOWN_FILTER } from '@/lib/events/consent-eligibility';
import { guestContactOf, processingContactMongoFilter } from '@/lib/submissions/guest-contact';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';

export type QueueStatus = 'pending_review' | 'rejected' | 'approved';

export const QUEUE_STATUSES: readonly QueueStatus[] = ['pending_review', 'rejected', 'approved'];

export const isQueueStatus = (value: unknown): value is QueueStatus => typeof value === 'string' && (QUEUE_STATUSES as readonly string[]).includes(value);

export interface PhotoQueueItem {
  id: string;
  status: QueueStatus;
  createdAt: string;
  name: string;
  email: string | null;
  identityLabel: string;
  /** An approval link was already sent successfully. */
  approvalEmailSent: boolean;
  /** The plain photo while waiting or rejected (private, for moderators only), the real picture once approved. */
  photoUrl: string | null;
  frameKind: 'generated' | 'own' | 'none';
  shareOptIn: boolean;
  last: { action: 'approve' | 'reject' | 'return_to_vetting'; by: string; at: string; reason: string | null } | null;
  /** Why the photo was rejected, as keys of the `reject_reason` group of the event's vocabulary (issue 628); none for a photo that was not rejected or was rejected before reasons existed. */
  rejectReasons: string[];
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** Read one photo card for moderation. Analytics results are loaded from the linked Fanmass per-photo result, never from legacy annotations. */
export function toPhotoQueueItem(doc: Document): PhotoQueueItem {
  const status: QueueStatus = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review';
  const review = (doc.photoReview ?? {}) as Document;
  const history = Array.isArray(doc.reviewHistory) ? (doc.reviewHistory as Document[]) : [];
  const last = history[history.length - 1];
  const contact = guestContactOf(doc);
  const name = contact.name ?? text(doc.userInfoDraft?.name) ?? text(doc.userName) ?? 'Guest';
  const email = contact.email;
  const registered = typeof doc.userId === 'string' && Boolean(doc.userId) && doc.userId !== 'anonymous';
  return {
    id: String(doc._id),
    status,
    createdAt: text(doc.createdAt) ?? '',
    name,
    email,
    identityLabel: email ?? (registered ? 'REGISTERED · NO EMAIL' : 'NO USER'),
    approvalEmailSent: doc.metadata?.emailSentAfterSave === true || doc.metadata?.emailSent === true,
    photoUrl: status === 'approved' || (status === 'pending_review' && typeof review.returnedAt === 'string')
      ? text(doc.imageUrl) ?? text(review.photoUrl)
      // Older rejected records may have lost the nested moderation address
      // while retaining the original and its backup copies.
      : text(review.photoUrl) ?? text(doc.originalImageUrl) ?? text(doc.imageUrl) ?? text(doc.finalImageUrl),
    frameKind: doc.frameVariant ? 'generated' : doc.frameId ? 'own' : 'none',
    shareOptIn: review.shareOptIn === true,
    rejectReasons: Array.isArray(doc.rejectReasons) ? doc.rejectReasons.filter((key): key is string => typeof key === 'string' && key.length > 0) : [],
    last:
      last && (last.action === 'approve' || last.action === 'reject' || last.action === 'return_to_vetting')
        ? { action: last.action, by: text(last.by) ?? 'unknown', at: text(last.at) ?? '', reason: text(last.reason) }
        : null,
  };
}

export function queueFilter(eventUuid: string, status: QueueStatus): Document {
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      CONSENT_ELIGIBLE_FILTER,
      processingContactMongoFilter,
      {
        photoReview: { $exists: true },
        reviewStatus: status,
        isArchived: { $ne: true },
        retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
        ...PRIVACY_ERASURE_ACTIVE_FILTER,
      },
    ],
  };
}

export async function loadPhotoQueue(db: Db, eventUuid: string, status: QueueStatus, limit = 60, offset = 0): Promise<PhotoQueueItem[]> {
  // The waiting list is worked oldest first; the decided lists show the latest decisions first.
  const docs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(queueFilter(eventUuid, status))
    .sort({ createdAt: status === 'pending_review' ? 1 : -1 })
    .skip(Math.max(0, Math.floor(offset)))
    .limit(limit)
    .toArray();
  return docs.map(toPhotoQueueItem);
}

export async function countPhotoQueue(db: Db, eventUuid: string): Promise<Record<QueueStatus, number> & { consentPending: number; consentUnknown: number }> {
  const eventFilter = { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] };
  const [pending, rejected, approved, consentPending, consentUnknown] = await Promise.all([
    ...QUEUE_STATUSES.map((status) => db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(queueFilter(eventUuid, status))),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_PENDING_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] }, ...PRIVACY_ERASURE_ACTIVE_FILTER }],
    }),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_UNKNOWN_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] }, ...PRIVACY_ERASURE_ACTIVE_FILTER }],
    }),
  ]);
  return { pending_review: pending, rejected, approved, consentPending, consentUnknown };
}

/**
 * How many photos wait for approval, in total and per event (by event UUID), for the dashboards. `eventUuids` limits it to the events
 * a partner-scoped session may see; null counts every event.
 */
export async function countWaitingPhotos(db: Db, eventUuids: readonly string[] | null): Promise<{ total: number; byEvent: Map<string, number> }> {
  if (eventUuids && eventUuids.length === 0) return { total: 0, byEvent: new Map() };
  const rows = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .aggregate<{ _id: string; count: number }>([
      {
        $match: {
          photoReview: { $exists: true },
          reviewStatus: 'pending_review',
          isArchived: { $ne: true },
          ...CONSENT_ELIGIBLE_FILTER,
          ...processingContactMongoFilter,
          retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
          ...PRIVACY_ERASURE_ACTIVE_FILTER,
          eventId: eventUuids ? { $in: [...eventUuids] } : { $type: 'string' },
        },
      },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ])
    .toArray();
  return { total: rows.reduce((sum, row) => sum + row.count, 0), byEvent: new Map(rows.map((row) => [row._id, row.count])) };
}

export interface WaitingPhotosEvent {
  /** The event's Mongo id, as used in /admin/events/<id>. */
  id: string;
  name: string;
  count: number;
}

/** The events that have photos waiting for approval, the busiest first (for the global Vetting page). */
export async function listEventsWithWaitingPhotos(db: Db): Promise<WaitingPhotosEvent[]> {
  const { byEvent } = await countWaitingPhotos(db, null);
  if (byEvent.size === 0) return [];
  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find({ eventId: { $in: [...byEvent.keys()] } }, { projection: { eventId: 1, name: 1 } })
    .toArray();
  return events
    .map((event) => ({ id: String(event._id), name: typeof event.name === 'string' ? event.name : String(event._id), count: byEvent.get(String(event.eventId)) ?? 0 }))
    .filter((event) => event.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
