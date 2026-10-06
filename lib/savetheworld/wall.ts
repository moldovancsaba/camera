import { eventMatchFor } from './publishSelfies';
import { notWaitingOrRejectedClause } from '@/lib/submissions/visibility';

/**
 * Filter for GET /api/internal/savetheworld/pledges (savetheworld's public wall
 * and galleries). Strict opt-in: only submissions the fan explicitly shared
 * (`isShareVisible === true`). A missing or `false` flag is never public;
 * `publish-selfies` is the admin's deliberate way to publish legacy photos.
 */
export function buildWallFilter(eventKeys: string[]): Record<string, unknown> {
  return {
    $and: [
      eventMatchFor(eventKeys),
      { submissionKind: { $ne: 'tryon_result' } },
      { isShareVisible: true },
      // A vetted photo that is waiting or was rejected is never on the wall (camera#270).
      notWaitingOrRejectedClause,
      // Only fields this route will return; the raw originalImageUrl is never shown here.
      { $or: [{ previewImageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }, { imageUrl: { $type: 'string' } }] },
    ],
  };
}
