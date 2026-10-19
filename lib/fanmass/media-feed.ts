/**
 * The query behind GET /api/internal/fanmass/events/[eventId]/media (camera#270, docs/PHOTO_VETTING_PLAN.md).
 *
 * fanmass polls with a compound cursor (availability time + stable submission id). A vetted photo is approved some time after it
 * was taken, possibly after fanmass already moved its cursor past that moment, so the feed orders and cuts by the moment a photo
 * became available: `approvedAt` for a vetted photo, `createdAt` for every other photo. The id tie-breaker prevents photos with
 * identical timestamps from falling behind the cursor. A photo that is waiting or was rejected is not in the feed.
 */

import { publiclyVisibleClauses } from '@/lib/submissions/visibility';

export const FANMASS_MEDIA_JOBS_CONTRACT = 'camera.fanmass.media-jobs.v1';

/** Query shared by the cursor feed and the durable Fanmass claim endpoint. */
export function buildMediaFeedEligibilityMatch(eventId: string): Record<string, unknown> {
  return {
    $and: [
      { $or: [{ eventId }, { eventIds: eventId }] },
      ...publiclyVisibleClauses([eventId]),
      { submissionKind: { $ne: 'tryon_result' } },
      {
        $or: [
          { originalImageUrl: { $type: 'string', $ne: '' } },
          // Older approved submissions may only have the public composite URL.
          // Preserve the legacy feed's imageUrl/finalImageUrl fallback for them.
          { imageUrl: { $type: 'string', $ne: '' } },
          { finalImageUrl: { $type: 'string', $ne: '' } },
        ],
      },
    ],
  };
}

export function buildMediaFeedPipeline(
  eventId: string,
  since: string | null | undefined,
  limit: number,
  afterSubmissionId?: string | null,
): object[] {
  return [
    {
      $match: buildMediaFeedEligibilityMatch(eventId),
    },
    { $addFields: { availableAt: { $ifNull: ['$approvedAt', '$createdAt'] } } },
    ...(since
      ? [{
          $match: afterSubmissionId == null
            ? { availableAt: { $gt: since } }
            : {
                $or: [
                  { availableAt: { $gt: since } },
                  { availableAt: since, submissionId: { $gt: afterSubmissionId } },
                ],
              },
        }]
      : []),
    { $sort: afterSubmissionId == null ? { availableAt: 1 } : { availableAt: 1, submissionId: 1 } },
    { $limit: limit },
  ];
}
