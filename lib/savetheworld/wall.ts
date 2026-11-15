import { eventMatchFor, galleryConsentMarkerClause } from './publishSelfies';
import { notWaitingOrRejectedClause } from '@/lib/submissions/visibility';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { ownerMediaUseMongoFilter } from '@/lib/events/consent-eligibility';

/**
 * Filter for GET /api/internal/savetheworld/pledges (savetheworld's public wall
 * and galleries). Strict opt-in: only submissions the fan explicitly shared
 * (`isShareVisible === true`). A missing or `false` flag is never public;
 * `publish-selfies` is the admin's deliberate way to publish legacy photos.
 * When the event asks for the public-gallery permission (`asked`, issue 554), the photo must also carry
 * the ticked-box marker, so nothing the bulk publish set without evidence shows on the wall.
 */
export function buildWallFilter(eventKeys: string[], asked = false): Record<string, unknown> {
  return {
    $and: [
      eventMatchFor(eventKeys),
      PRIVACY_ERASURE_ACTIVE_FILTER,
      { submissionKind: { $ne: 'tryon_result' } },
      { isShareVisible: true },
      ...(asked ? [{ $or: [galleryConsentMarkerClause, ownerMediaUseMongoFilter('public_gallery', eventKeys)] }] : []),
      // A vetted photo that is waiting or was rejected is never on the wall (camera#270).
      notWaitingOrRejectedClause,
      // Only fields this route will return; the raw originalImageUrl is never shown here.
      { $or: [{ previewImageUrl: { $type: 'string' } }, { finalImageUrl: { $type: 'string' } }, { imageUrl: { $type: 'string' } }] },
    ],
  };
}
