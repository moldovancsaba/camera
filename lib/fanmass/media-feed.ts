/**
 * The query behind GET /api/internal/fanmass/events/[eventId]/media (camera#270, docs/PHOTO_VETTING_PLAN.md).
 *
 * fanmass polls with a compound cursor (availability time + stable submission id). A vetted photo is approved some time after it
 * was taken, possibly after fanmass already moved its cursor past that moment, so the feed orders and cuts by the moment a photo
 * became available: `approvedAt` for a vetted photo, `createdAt` for every other photo. The id tie-breaker prevents photos with
 * identical timestamps from falling behind the cursor. A photo that is waiting or was rejected is not in the feed.
 */

import { publiclyVisibleClauses } from '@/lib/submissions/visibility';

export function buildMediaFeedPipeline(
  eventId: string,
  since: string | null | undefined,
  limit: number,
  afterSubmissionId?: string | null,
): object[] {
  return [
    {
      $match: {
        $and: [
          { $or: [{ eventId }, { eventIds: eventId }] },
          ...publiclyVisibleClauses([eventId]),
          { submissionKind: { $ne: 'tryon_result' } },
          { originalImageUrl: { $type: 'string' } },
        ],
      },
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
