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
  /** Optional Camera screening hint; its result cannot make a vetting decision. */
  precheck: PhotoModerationQueueSignal | null;
  /** A private manager-only archive copy. It can be viewed, but not reviewed or republished. */
  recoveryOnly?: boolean;
}

export interface PhotoModerationQueueSignal {
  status: 'queued' | 'submitting' | 'queued_remote' | 'running' | 'completed' | 'failed';
  signal?: 'flagged' | 'uncertain' | 'no_flags_detected';
  flags: string[];
  model?: string;
  /** Preserve the provider's mandatory no-automation invariants in the reviewer data contract. */
  review_required?: true;
  automated_decision?: 'none';
  categories?: Record<PrecheckCategory, PrecheckCategorySignal>;
  evidence?: string;
  limitations?: string;
  errorCode?: string;
}

const PRECHECK_STATUSES = new Set<PhotoModerationQueueSignal['status']>(['queued', 'submitting', 'queued_remote', 'running', 'completed', 'failed']);
const PRECHECK_CATEGORY_KEYS = ['nudity', 'sexualContent', 'middleFinger', 'hateSymbols', 'hateWords', 'alcohol', 'drugs', 'violence', 'weapons'] as const;
const PRECHECK_CATEGORIES = new Set<string>(PRECHECK_CATEGORY_KEYS);
type PrecheckCategory = (typeof PRECHECK_CATEGORY_KEYS)[number];
type PrecheckCategorySignal = 'detected' | 'not_detected' | 'uncertain';

function queueCategories(value: unknown): Record<PrecheckCategory, PrecheckCategorySignal> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== PRECHECK_CATEGORY_KEYS.length) return null;
  const result = {} as Record<PrecheckCategory, PrecheckCategorySignal>;
  for (const category of PRECHECK_CATEGORY_KEYS) {
    const signal = source[category];
    if (signal !== 'detected' && signal !== 'not_detected' && signal !== 'uncertain') return null;
    result[category] = signal;
  }
  return result;
}

export function precheckSummary(precheck: PhotoModerationQueueSignal | null): string | null {
  if (!precheck) return null;
  if (precheck.status === 'failed') return 'Unavailable · review manually';
  if (precheck.status === 'queued' || precheck.status === 'submitting') return 'Waiting';
  if (precheck.status === 'queued_remote') return 'Queued';
  if (precheck.status === 'running') return 'Analyzing';
  if (precheck.signal === 'flagged') return `Possible concern · ${precheck.flags.length} signal${precheck.flags.length === 1 ? '' : 's'}`;
  if (precheck.signal === 'uncertain') return 'Uncertain · review manually';
  return 'No listed concern detected · review manually';
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** Read one photo card for moderation. Analytics results are loaded from the linked Fanmass per-photo result, never from legacy annotations. */
export function toPhotoQueueItem(doc: Document, recoveryEventMongoId?: string): PhotoQueueItem {
  const status: QueueStatus = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review';
  const review = (doc.photoReview ?? {}) as Document;
  const history = Array.isArray(doc.reviewHistory) ? (doc.reviewHistory as Document[]) : [];
  const last = history[history.length - 1];
  const rawPrecheck = doc.moderationPrecheck && typeof doc.moderationPrecheck === 'object' ? doc.moderationPrecheck as Document : null;
  const rawResult = rawPrecheck?.result && typeof rawPrecheck.result === 'object' ? rawPrecheck.result as Document : null;
  const rawSignal = rawResult?.signal;
  const precheckStatus = rawPrecheck?.status;
  const categories = queueCategories(rawResult?.categories);
  const precheck: PhotoModerationQueueSignal | null = typeof precheckStatus === 'string' && PRECHECK_STATUSES.has(precheckStatus as PhotoModerationQueueSignal['status'])
    ? {
        status: precheckStatus as PhotoModerationQueueSignal['status'],
        ...(rawSignal === 'flagged' || rawSignal === 'uncertain' || rawSignal === 'no_flags_detected' ? { signal: rawSignal } : {}),
        flags: Array.isArray(rawResult?.flags) ? rawResult!.flags.filter((flag): flag is string => typeof flag === 'string' && PRECHECK_CATEGORIES.has(flag)) : [],
        ...(typeof rawResult?.model === 'string' ? { model: rawResult.model.slice(0, 160) } : {}),
        ...(rawResult?.review_required === true ? { review_required: true as const } : {}),
        ...(rawResult?.automated_decision === 'none' ? { automated_decision: 'none' as const } : {}),
        ...(categories ? { categories } : {}),
        ...(typeof rawResult?.evidence === 'string' ? { evidence: rawResult.evidence.slice(0, 800) } : {}),
        ...(typeof rawResult?.limitations === 'string' ? { limitations: rawResult.limitations.slice(0, 800) } : {}),
        ...(typeof rawPrecheck?.lastErrorCode === 'string' ? { errorCode: rawPrecheck.lastErrorCode.slice(0, 80) } : {}),
      }
    : null;
  const contact = guestContactOf(doc);
  const name = contact.name ?? text(doc.userInfoDraft?.name) ?? text(doc.userName) ?? 'Guest';
  const email = contact.email;
  const registered = typeof doc.userId === 'string' && Boolean(doc.userId) && doc.userId !== 'anonymous';
  const recovery = doc.adminRecovery as Document | undefined;
  const recoveryOnly = Boolean(recoveryEventMongoId && recovery?.state === 'available' && recovery.store === 'camera-mtk-recovery' && (status === 'approved' || status === 'rejected'));
  return {
    id: String(doc._id),
    status,
    createdAt: text(doc.createdAt) ?? '',
    name,
    email,
    identityLabel: email ?? (registered ? 'REGISTERED · NO EMAIL' : 'NO USER'),
    approvalEmailSent: doc.metadata?.emailSentAfterSave === true || doc.metadata?.emailSent === true,
    photoUrl: recoveryOnly
      ? `/api/admin/events/${recoveryEventMongoId}/recovered-photos/${String(doc._id)}/image`
      : status === 'approved' || (status === 'pending_review' && typeof review.returnedAt === 'string')
      ? text(doc.imageUrl) ?? text(review.photoUrl)
      // Older rejected records may have lost the nested moderation address
      // while retaining the original and its backup copies.
      : text(review.photoUrl) ?? text(doc.originalImageUrl) ?? text(doc.imageUrl) ?? text(doc.finalImageUrl),
    frameKind: doc.frameVariant ? 'generated' : doc.frameId ? 'own' : 'none',
    shareOptIn: review.shareOptIn === true,
    rejectReasons: Array.isArray(doc.rejectReasons) ? doc.rejectReasons.filter((key): key is string => typeof key === 'string' && key.length > 0) : [],
    precheck,
    ...(recoveryOnly ? { recoveryOnly: true } : {}),
    last:
      last && (last.action === 'approve' || last.action === 'reject' || last.action === 'return_to_vetting')
        ? { action: last.action, by: text(last.by) ?? 'unknown', at: text(last.at) ?? '', reason: text(last.reason) }
        : null,
  };
}

/** Manager-visible archive copies return to their historical decision tab, never to public or actionable queues. */
export function recoveredQueueFilter(eventUuid: string, status: Exclude<QueueStatus, 'pending_review'>): Document {
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      {
        consentStatus: 'expired',
        retentionStatus: 'erased',
        'adminRecovery.state': 'available',
        'adminRecovery.store': 'camera-mtk-recovery',
        'adminRecovery.originalReviewStatus': status,
        isArchived: { $ne: true },
        ...PRIVACY_ERASURE_ACTIVE_FILTER,
      },
    ],
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

export async function loadPhotoQueue(
  db: Db,
  eventUuid: string,
  status: QueueStatus,
  limit = 60,
  offset = 0,
  recovery?: { eventMongoId: string },
): Promise<PhotoQueueItem[]> {
  // The waiting list is worked oldest first; the decided lists show the latest decisions first.
  const collection = db.collection(COLLECTIONS.SUBMISSIONS);
  const safeOffset = Math.max(0, Math.floor(offset));
  const regularTotal = recovery && status !== 'pending_review'
    ? await collection.countDocuments(queueFilter(eventUuid, status))
    : null;
  const regularOffset = regularTotal === null ? safeOffset : Math.min(safeOffset, regularTotal);
  const regularLimit = regularTotal === null ? limit : Math.min(limit, Math.max(0, regularTotal - regularOffset));
  const regular = regularLimit > 0
    ? await collection
        .find(queueFilter(eventUuid, status))
        .sort({ createdAt: status === 'pending_review' ? 1 : -1 })
        .skip(regularOffset)
        .limit(regularLimit)
        .toArray()
    : [];
  if (!recovery || status === 'pending_review' || regularTotal === null || regular.length >= limit) {
    return regular.map((doc) => toPhotoQueueItem(doc));
  }

  const recoveryOffset = Math.max(0, safeOffset - regularTotal);
  const recoveryLimit = Math.max(0, limit - regular.length);
  const archived = recoveryLimit > 0
    ? await collection
        .find(recoveredQueueFilter(eventUuid, status))
        .sort({ createdAt: -1 })
        .skip(recoveryOffset)
        .limit(recoveryLimit)
        .toArray()
    : [];
  return [
    ...regular.map((doc) => toPhotoQueueItem(doc)),
    ...archived.map((doc) => toPhotoQueueItem(doc, recovery.eventMongoId)),
  ];
}

export async function countPhotoQueue(db: Db, eventUuid: string, recoveryEventMongoId?: string): Promise<Record<QueueStatus, number> & { consentPending: number; consentUnknown: number }> {
  const eventFilter = { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] };
  const [pending, rejected, approved, consentPending, consentUnknown, recoveryRejected, recoveryApproved] = await Promise.all([
    ...QUEUE_STATUSES.map((status) => db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(queueFilter(eventUuid, status))),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_PENDING_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] }, ...PRIVACY_ERASURE_ACTIVE_FILTER }],
    }),
    db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
      $and: [eventFilter, CONSENT_UNKNOWN_FILTER, { photoReview: { $exists: true }, isArchived: { $ne: true }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] }, ...PRIVACY_ERASURE_ACTIVE_FILTER }],
    }),
    recoveryEventMongoId ? db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(recoveredQueueFilter(eventUuid, 'rejected')) : 0,
    recoveryEventMongoId ? db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(recoveredQueueFilter(eventUuid, 'approved')) : 0,
  ]);
  return { pending_review: pending, rejected: rejected + recoveryRejected, approved: approved + recoveryApproved, consentPending, consentUnknown };
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
