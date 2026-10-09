import { eventMatchFor } from './publishSelfies';
import { notWaitingOrRejectedClause } from '@/lib/submissions/visibility';

/**
 * Filter for GET /api/internal/savetheworld/pledges (savetheworld's public wall
 * and galleries). Strict opt-in: only submissions the fan explicitly shared
 * (`isShareVisible === true`) with a consent marker written by the current
 * explicit opt-in capture flow. Older submissions without that marker stay private.
 */
export function buildWallFilter(eventKeys: string[]): Record<string, unknown> {
  return {
    $and: [
      eventMatchFor(eventKeys),
      { submissionKind: { $ne: 'tryon_result' } },
      { isShareVisible: true },
      { 'publicGalleryConsent.version': 1 },
      // A vetted photo that is waiting or was rejected is never on the wall (camera#270).
      notWaitingOrRejectedClause,
      // Only fields this route will return; the raw originalImageUrl is never shown here.
      { $or: [{ previewImageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }, { imageUrl: { $type: 'string' } }] },
    ],
  };
}
