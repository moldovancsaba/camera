/**
 * Whether a saved photo may be shown or sent publicly (camera#262, docs/PHOTO_VETTING_PLAN.md). One rule for every public
 * surface (share page and its link preview, share download, slideshow candidates, user pages, and later the feeds), instead of
 * a filter copied into each of them.
 *
 * - Archived by an admin: never public.
 * - Hidden from every event it belongs to ("remove from event"): never public.
 * - A plain photo is public unless its review says `pending_review` or `rejected`. A missing status is public: photos saved
 *   before vetting existed carry none, and that must not hide history (the plan backfills them as approved).
 * - A try-on result is public only when it was approved and was not turned off for sharing, as the share page already requires.
 *
 * Pure and DOM-free, unit-tested in visibility.test.ts.
 */

export interface VisibilityInput {
  submissionKind?: string | null;
  reviewStatus?: string | null;
  isArchived?: boolean | null;
  hiddenFromEvents?: readonly string[] | null;
  isShareVisible?: boolean | null;
  eventId?: string | null;
  eventIds?: readonly string[] | null;
}

/** Every event reference a photo belongs to (the UUID and the ids it was filed under), without duplicates. */
function eventRefs(submission: VisibilityInput): string[] {
  const refs = new Set<string>();
  if (typeof submission.eventId === 'string' && submission.eventId) refs.add(submission.eventId);
  for (const id of submission.eventIds ?? []) if (typeof id === 'string' && id) refs.add(id);
  return [...refs];
}

/** Hidden from every event it belongs to (a photo that belongs to no event cannot be hidden from one). */
export function isHiddenFromAllEvents(submission: VisibilityInput): boolean {
  const refs = eventRefs(submission);
  const hidden = submission.hiddenFromEvents ?? [];
  return refs.length > 0 && refs.every((ref) => hidden.includes(ref));
}

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []);

/** The fields the rule reads, taken defensively from a database document (any shape, any missing field). */
export function visibilityInputOf(doc: Record<string, unknown> | null | undefined): VisibilityInput | null {
  if (!doc || typeof doc !== 'object') return null;
  return {
    submissionKind: text(doc.submissionKind),
    reviewStatus: text(doc.reviewStatus),
    isArchived: doc.isArchived === true,
    hiddenFromEvents: texts(doc.hiddenFromEvents),
    isShareVisible: typeof doc.isShareVisible === 'boolean' ? doc.isShareVisible : null,
    eventId: text(doc.eventId),
    eventIds: texts(doc.eventIds),
  };
}

export function isPubliclyVisible(submission: VisibilityInput | null | undefined): boolean {
  if (!submission) return false;
  if (submission.isArchived === true) return false;
  if (isHiddenFromAllEvents(submission)) return false;

  if (submission.submissionKind === 'tryon_result') {
    return submission.reviewStatus === 'approved' && submission.isShareVisible !== false;
  }
  return submission.reviewStatus !== 'pending_review' && submission.reviewStatus !== 'rejected';
}

/** Review states that keep a photo off every feed and page: waiting for a decision, or not approved (camera#270). */
export const UNPUBLISHED_REVIEW_STATUSES = ['pending_review', 'rejected'] as const;

/** `reviewStatus` is neither of them; a missing status passes (photos from before vetting carry none). For feeds that already restrict the kind. */
export const notWaitingOrRejectedClause = { reviewStatus: { $nin: [...UNPUBLISHED_REVIEW_STATUSES] } };

/** The same rule for a MongoDB query on plain photos and approved try-on results (the shape the slideshow routes use). */
export function publiclyVisibleClauses(eventIdKeys: readonly string[]): object[] {
  return [
    { isArchived: { $ne: true } },
    { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: [...eventIdKeys] } }] },
    {
      $or: [
        {
          $and: [
            { $or: [{ submissionKind: { $exists: false } }, { submissionKind: 'original' }] },
            { reviewStatus: { $nin: ['pending_review', 'rejected'] } },
          ],
        },
        { $and: [{ submissionKind: 'tryon_result' }, { reviewStatus: 'approved' }, { isShareVisible: { $ne: false } }] },
      ],
    },
  ];
}
