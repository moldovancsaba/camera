/**
 * Filters for POST /api/internal/savetheworld/events/[eventId]/publish-selfies.
 *
 * Kept out of the route file (Next.js route modules may only export handlers)
 * so the scoping can be unit-tested.
 *
 * Every condition is combined with an explicit $and. The route used to build
 * `{ ...eventMatch, $or: [imageClauses], ... }`, but eventMatch is itself an
 * `$or`, so the second `$or` key replaced it and the event condition vanished:
 * one click published every non-tryon selfie across ALL events. Never merge two
 * `$or` clauses into the same object literal.
 */

import { notWaitingOrRejectedClause } from '@/lib/submissions/visibility';

/** Submissions belonging to one event, under any identifier they may carry. */
export function eventMatchFor(eventKeys: string[]): Record<string, unknown> {
  if (eventKeys.length === 0) {
    throw new Error('publish-selfies: refusing to build an unscoped event filter');
  }
  return { $or: [{ eventId: { $in: eventKeys } }, { eventIds: { $in: eventKeys } }] };
}

/**
 * Only submissions with affirmative, versioned photo-sharing consent may be
 * published. Legacy records have no marker and cannot be bulk-published.
 */
export function buildPublishSelfiesFilter(eventKeys: string[]): Record<string, unknown> {
  return {
    $and: [
      eventMatchFor(eventKeys),
      { submissionKind: { $ne: 'tryon_result' } },
      {
        $or: [
          { finalImageUrl: { $type: 'string' } },
          { imageUrl: { $type: 'string' } },
          { originalImageUrl: { $type: 'string' } },
        ],
      },
      { 'publicGalleryConsent.version': 1 },
      { isShareVisible: null },
      // Never publish a vetted photo that is waiting or was rejected (camera#270).
      notWaitingOrRejectedClause,
    ],
  };
}

/** All non-tryon submissions of the event (the `total` in the response). */
export function buildEventSubmissionsFilter(eventKeys: string[]): Record<string, unknown> {
  return { $and: [eventMatchFor(eventKeys), { submissionKind: { $ne: 'tryon_result' } }, notWaitingOrRejectedClause] };
}
