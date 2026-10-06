/**
 * The query behind GET /api/internal/fanmass/events/[eventId]/media (camera#270, docs/PHOTO_VETTING_PLAN.md).
 *
 * fanmass polls with a cursor and only ever asks for photos newer than it. A vetted photo is approved some time after it was taken,
 * possibly after fanmass already moved its cursor past that moment, so the feed orders and cuts by the moment a photo became
 * available: `approvedAt` for a vetted photo, `createdAt` for every other photo. A photo that is waiting or was rejected is not in
 * the feed. Pure, so it is unit-tested (media-feed.test.ts).
 */

import { notWaitingOrRejectedClause } from '@/lib/submissions/visibility';

export function buildMediaFeedPipeline(eventId: string, since: string | null | undefined, limit: number): object[] {
  return [
    {
      $match: {
        $or: [{ eventId }, { eventIds: eventId }],
        submissionKind: { $ne: 'tryon_result' },
        originalImageUrl: { $type: 'string' },
        ...notWaitingOrRejectedClause,
      },
    },
    { $addFields: { availableAt: { $ifNull: ['$approvedAt', '$createdAt'] } } },
    ...(since ? [{ $match: { availableAt: { $gt: since } } }] : []),
    { $sort: { availableAt: 1 } },
    { $limit: limit },
  ];
}
