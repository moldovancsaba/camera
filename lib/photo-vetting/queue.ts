/**
 * What the moderation queue shows for an event (camera#268, docs/PHOTO_VETTING_PLAN.md): the photos of vetted events grouped by
 * review status, oldest waiting first. Only photos that went through vetting (they carry `photoReview`) are listed; photos made before
 * vetting, have their own screens.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { plainPhotoClause } from '@/lib/submissions/visibility';
import { CONSENT_ELIGIBLE_FILTER, CONSENT_PENDING_FILTER, CONSENT_UNKNOWN_FILTER, hasConsentEvidenceForProcessing } from '@/lib/events/consent-eligibility';
import { parsePeople, type PersonTag } from './people';
import type { ResolvedVocabulary } from './vocabulary';

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
  /** The original, unframed picture used only by Analysis. Never falls back to the approved framed composite. */
  analysisPhotoUrl: string | null;
  frameKind: 'generated' | 'own' | 'none';
  shareOptIn: boolean;
  last: { action: 'approve' | 'reject' | 'return_to_vetting'; by: string; at: string; reason: string | null } | null;
  /** The people marked in the photo (issue 542), none when nobody looked or the saved list is not valid. */
  people: PersonTag[];
  /** The saved analysis count, or null when the stored list cannot be read safely. */
  peopleCount: number | null;
  /** Someone marked the people (also when nobody was in the photo). */
  peopleMarked: boolean;
  /** Who last saved the people analysis and when. */
  analysisBy: string | null;
  analysisAt: string | null;
  /** Why the photo was rejected, as keys of the `reject_reason` group of the event's vocabulary (issue 628); none for a photo that was not rejected or was rejected before reasons existed. */
  rejectReasons: string[];
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const emailOf = (doc: Document): string | null => {
  const emails = [text(doc.userInfo?.email), text(doc.userInfoDraft?.email), text(doc.userEmail)];
  return emails.find((email) => email && email !== 'anonymous@event' && email !== 'anonymous@event.com') ?? null;
};

/**
 * One photo of the queue. The people are read with the vocabulary of the **event** (issue 628): a custom option of the event would otherwise make a marked photo read as unmarked, and the
 * vocabulary is required so no caller can forget it.
 */
export function toPhotoQueueItem(doc: Document, vocabulary: ResolvedVocabulary): PhotoQueueItem {
  const status: QueueStatus = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review';
  const review = (doc.photoReview ?? {}) as Document;
  const unframedCopies = Array.isArray(doc.imageCopies) ? (doc.imageCopies as Document[]) : [];
  const verifiedUnframedCopy = unframedCopies.find((copy) => copy.role === 'unframed' && copy.state === 'verified' && typeof copy.url === 'string' && copy.url.trim());
  const history = Array.isArray(doc.reviewHistory) ? (doc.reviewHistory as Document[]) : [];
  const last = history[history.length - 1];
  const name = text(doc.userInfo?.name) ?? text(doc.userInfoDraft?.name) ?? text(doc.userName) ?? 'Guest';
  const email = emailOf(doc);
  const registered = typeof doc.userId === 'string' && Boolean(doc.userId) && doc.userId !== 'anonymous';
  const peopleReview = (doc.peopleReview ?? {}) as Document;
  const peopleCheck = parsePeople(doc.people ?? [], vocabulary);
  return {
    id: String(doc._id),
    status,
    createdAt: text(doc.createdAt) ?? '',
    name,
    email,
    identityLabel: email ?? (registered ? 'REGISTERED · NO EMAIL' : 'NO USER'),
    approvalEmailSent: doc.metadata?.emailSentAfterSave === true || doc.metadata?.emailSent === true,
    photoUrl: status === 'approved' || (status === 'pending_review' && typeof review.returnedAt === 'string') ? text(doc.imageUrl) ?? text(review.photoUrl) : text(review.photoUrl),
    analysisPhotoUrl: text(review.photoUrl) ?? text(verifiedUnframedCopy?.url),
    frameKind: doc.frameVariant ? 'generated' : doc.frameId ? 'own' : 'none',
    shareOptIn: review.shareOptIn === true,
    people: peopleCheck.ok ? peopleCheck.value : [],
    peopleCount: Array.isArray(doc.people) && peopleCheck.ok ? peopleCheck.value.length : null,
    peopleMarked: Array.isArray(doc.people),
    analysisBy: text(peopleReview.by),
    analysisAt: text(peopleReview.at),
    rejectReasons: Array.isArray(doc.rejectReasons) ? doc.rejectReasons.filter((key): key is string => typeof key === 'string' && key.length > 0) : [],
    last:
      last && (last.action === 'approve' || last.action === 'reject' || last.action === 'return_to_vetting')
        ? { action: last.action, by: text(last.by) ?? 'unknown', at: text(last.at) ?? '', reason: text(last.reason) }
        : null,
  };
}

export type PhotoAnalysisTab = 'needs_analysis' | 'analysed';
export type PhotoAnalysisDecision = 'approved' | 'rejected' | 'published';

/** A photo available to the separate, analysis-only event workbench. */
export interface PhotoAnalysisItem extends Omit<PhotoQueueItem, 'status'> {
  /** `published` means it was not held for a vetting decision. */
  status: PhotoAnalysisDecision;
}

/**
 * The independent analysis queue includes completed vetting decisions and photos that were published without vetting.
 * A photo still awaiting a decision is deliberately excluded so analysis cannot overlap with an active vetting decision.
 */
export function photoAnalysisEligibilityFilter(eventUuid: string): Document {
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      { isArchived: { $ne: true } },
      plainPhotoClause,
      { 'mediaHealth.broken': { $ne: true } },
      CONSENT_ELIGIBLE_FILTER,
      { reviewStatus: { $ne: 'pending_review' } },
      {
        $or: [
          { photoReview: { $exists: false } },
          { photoReview: null },
          { reviewStatus: { $in: ['approved', 'rejected'] } },
        ],
      },
      {
        $or: [
          { imageUrl: { $type: 'string', $ne: '' } },
          { finalImageUrl: { $type: 'string', $ne: '' } },
          { previewImageUrl: { $type: 'string', $ne: '' } },
          { 'photoReview.photoUrl': { $type: 'string', $ne: '' } },
        ],
      },
    ],
  };
}

/** Same eligibility rule as the queue, checked again before an analysis save. */
export function photoAnalysisRecordEligible(doc: Document): boolean {
  if (doc.isArchived === true || (doc.mediaHealth as Document | undefined)?.broken === true) return false;
  if (doc.submissionKind != null && doc.submissionKind !== 'original') return false;
  if (!hasConsentEvidenceForProcessing(doc)) return false;
  if (doc.reviewStatus === 'pending_review') return false;
  const reviewExists = doc.photoReview !== undefined && doc.photoReview !== null;
  if (reviewExists && doc.reviewStatus !== 'approved' && doc.reviewStatus !== 'rejected') return false;
  const review = (doc.photoReview ?? {}) as Document;
  return Boolean(text(review.photoUrl) || text(doc.imageUrl) || text(doc.finalImageUrl) || text(doc.previewImageUrl));
}

/** Read one queue item without applying vetting's pending-by-default status to photos that were never vetted. */
export function toPhotoAnalysisItem(doc: Document, vocabulary: ResolvedVocabulary): PhotoAnalysisItem {
  const item = toPhotoQueueItem(doc, vocabulary);
  const review = (doc.photoReview ?? {}) as Document;
  const status: PhotoAnalysisDecision = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'published';
  const photoUrl = status === 'rejected'
    ? text(review.photoUrl) ?? text(doc.imageUrl) ?? text(doc.finalImageUrl) ?? text(doc.previewImageUrl)
    : text(doc.imageUrl) ?? text(doc.finalImageUrl) ?? text(doc.previewImageUrl) ?? text(review.photoUrl);
  return { ...item, status, photoUrl };
}

export function photoAnalysisQueueFilter(eventUuid: string, tab: PhotoAnalysisTab): Document {
  return {
    ...photoAnalysisEligibilityFilter(eventUuid),
    people: tab === 'analysed' ? { $type: 'array' } : { $not: { $type: 'array' } },
  };
}

export async function loadPhotoAnalysisQueue(
  db: Db,
  eventUuid: string,
  tab: PhotoAnalysisTab,
  vocabulary: ResolvedVocabulary,
  limit = 60,
  offset = 0,
): Promise<PhotoAnalysisItem[]> {
  const rows = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(photoAnalysisQueueFilter(eventUuid, tab))
    .sort({ createdAt: tab === 'needs_analysis' ? 1 : -1, _id: tab === 'needs_analysis' ? 1 : -1 })
    .skip(Math.max(0, offset))
    .limit(limit)
    .toArray();
  return rows.map((row) => toPhotoAnalysisItem(row, vocabulary));
}

export async function countPhotoAnalysisQueue(db: Db, eventUuid: string): Promise<Record<PhotoAnalysisTab, number>> {
  const counts = await Promise.all(
    (['needs_analysis', 'analysed'] as const).map((tab) => db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(photoAnalysisQueueFilter(eventUuid, tab))),
  );
  return { needs_analysis: counts[0], analysed: counts[1] };
}

export function queueFilter(eventUuid: string, status: QueueStatus): Document {
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      CONSENT_ELIGIBLE_FILTER,
      {
        photoReview: { $exists: true },
        reviewStatus: status,
        isArchived: { $ne: true },
        retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
      },
    ],
  };
}

export async function loadPhotoQueue(db: Db, eventUuid: string, status: QueueStatus, vocabulary: ResolvedVocabulary, limit = 60): Promise<PhotoQueueItem[]> {
  // The waiting list is worked oldest first; the decided lists show the latest decisions first.
  const docs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(queueFilter(eventUuid, status))
    .sort({ createdAt: status === 'pending_review' ? 1 : -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => toPhotoQueueItem(doc, vocabulary));
}

export async function countPhotoQueue(db: Db, eventUuid: string): Promise<Record<QueueStatus, number> & { consentPending: number; consentUnknown: number }> {
  const eventFilter = { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] };
  const [pending, rejected, approved, consentPending, consentUnknown] = await Promise.all([
    ...QUEUE_STATUSES.map((status) => db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(queueFilter(eventUuid, status))),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_PENDING_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } }],
    }),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_UNKNOWN_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } }],
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
          retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
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
