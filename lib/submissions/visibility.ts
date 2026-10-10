/**
 * Whether a saved photo may be shown or sent publicly (camera#262, docs/PHOTO_VETTING_PLAN.md). One rule for every public
 * surface (share page and its link preview, share download, slideshow candidates, user pages, and later the feeds), instead of
 * a filter copied into each of them.
 *
 * - Archived by an admin: never public.
 * - Hidden from every event it belongs to ("remove from event"): never public.
 * - Only a plain photo (`submissionKind` missing or `original`) is public, and it is unless its review says `pending_review` or `rejected`.
 *   A missing status is public: photos saved before vetting existed carry none, and that must not hide history (the plan backfills them as approved).
 * - A stored try-on result (`submissionKind: 'tryon_result'`, from the integration that was removed, issue 557) is never public, whatever its
 *   review says: nothing shows it on any surface. It used to be public when approved and not turned off for sharing.
 * - A picture that is gone (its host answers 404, or serves its "image not found" stand-in): never public (`mediaHealth.broken`, lib/media/broken.ts). Not showing a picture is better
 *   than showing an error, on every surface (owner, 2026-10-09).
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
  /** The picture is known to be gone. */
  mediaBroken?: boolean | null;
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
    mediaBroken: (doc.mediaHealth as { broken?: unknown } | undefined)?.broken === true,
  };
}

export function isPubliclyVisible(submission: VisibilityInput | null | undefined): boolean {
  if (!submission) return false;
  if (submission.isArchived === true) return false;
  if (submission.mediaBroken === true) return false;
  if (isHiddenFromAllEvents(submission)) return false;
  // Only a plain photo can be public: a stored try-on result (or any other kind) never is.
  if (submission.submissionKind != null && submission.submissionKind !== 'original') return false;
  return submission.reviewStatus !== 'pending_review' && submission.reviewStatus !== 'rejected';
}

/** Review states that keep a photo off every feed and page: waiting for a decision, or not approved (camera#270). */
export const UNPUBLISHED_REVIEW_STATUSES = ['pending_review', 'rejected'] as const;

/** `reviewStatus` is neither of them; a missing status passes (photos from before vetting carry none). For feeds that already restrict the kind. */
export const notWaitingOrRejectedClause = { reviewStatus: { $nin: [...UNPUBLISHED_REVIEW_STATUSES] }, 'mediaHealth.broken': { $ne: true } };

/** A plain photo for a MongoDB query: `submissionKind` missing or `original`, never a stored try-on result. */
export const plainPhotoClause = { $or: [{ submissionKind: { $exists: false } }, { submissionKind: 'original' }] };

/** The same rule for a MongoDB query on plain photos (the shape the slideshow routes use). */
export function publiclyVisibleClauses(eventIdKeys: readonly string[]): object[] {
  return [
    { isArchived: { $ne: true } },
    // A picture that is gone is not shown (lib/media/broken.ts).
    { 'mediaHealth.broken': { $ne: true } },
    { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: [...eventIdKeys] } }] },
    {
      $and: [plainPhotoClause, { reviewStatus: { $nin: ['pending_review', 'rejected'] } }],
    },
  ];
}
