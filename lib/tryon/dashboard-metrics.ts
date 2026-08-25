import type { Db } from 'mongodb';
import { COLLECTIONS, type LeatherSuit, type Submission, type TryOnJob, type TryOnWorkerHeartbeat } from '@/lib/db/schemas';
import { activeTryOnQueueTotal, WORKER_OWNED_TRYON_QUEUE_STATUSES } from '@/lib/tryon/queue-status';
import { summarizeTryOnWorkerHealth, type TryOnWorkerHealthSummary } from '@/lib/tryon/worker-health';

// WHAT: The operational snapshot both the Try-On hub and the admin dashboard's
// attention row need — queue depth, worker health, garment counts, pending
// vetting. Extracted from app/admin/tryon/page.tsx so the dashboard doesn't
// duplicate (and drift from) that query set.
export interface TryOnDashboardMetrics {
  queueCounts: Record<string, number>;
  activeQueueTotal: number;
  activeSuitCount: number;
  totalSuitCount: number;
  pendingVettingCount: number;
  workerHealth: TryOnWorkerHealthSummary | null;
}

export interface ActiveEventRow {
  id: string;
  eventUuid: string;
  name: string;
  partnerName: string;
  pendingVettingCount: number;
}

// WHAT: A handful of the most recently-active events, each with its own pending
// count, for the dashboard's "Active events" strip.
// WHY: eventDate is optional and loosely populated (see lib/db/schemas.ts) so a
// true calendar-day "today" filter would silently miss events without a date —
// "most recently active" is the honest thing this data actually supports.
export async function collectActiveEventRows(
  db: Db,
  partnerIds: string[] | null,
  limit = 6
): Promise<ActiveEventRow[]> {
  const query: Record<string, unknown> = { isActive: true };
  if (partnerIds) {
    if (partnerIds.length === 0) return [];
    query.partnerId = { $in: partnerIds };
  }

  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find(query, { projection: { eventId: 1, name: 1, partnerName: 1, eventDate: 1, updatedAt: 1 } })
    .sort({ eventDate: -1, updatedAt: -1 })
    .limit(limit)
    .toArray();
  if (events.length === 0) return [];

  const uuids = events.map((event) => event.eventId).filter((value): value is string => typeof value === 'string');
  const pendingCounts = uuids.length
    ? await db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              submissionKind: 'tryon_result',
              reviewStatus: 'pending_review',
              'tryOnModerationArchive.archived': { $ne: true },
              $or: [{ eventId: { $in: uuids } }, { eventIds: { $elemMatch: { $in: uuids } } }],
            },
          },
          { $project: { eventRefs: { $setUnion: [[{ $ifNull: ['$eventId', ''] }], { $ifNull: ['$eventIds', []] }] } } },
          { $unwind: '$eventRefs' },
          { $match: { eventRefs: { $in: uuids } } },
          { $group: { _id: '$eventRefs', count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const pendingByUuid = new Map(pendingCounts.map((row) => [row._id, row.count]));

  return events.map((event) => ({
    id: String(event._id),
    eventUuid: typeof event.eventId === 'string' ? event.eventId : '',
    name: typeof event.name === 'string' ? event.name : 'Untitled event',
    partnerName: typeof event.partnerName === 'string' ? event.partnerName : '—',
    pendingVettingCount: pendingByUuid.get(event.eventId) ?? 0,
  }));
}

// WHAT: Pending-vetting and active-queue counts scoped to a specific set of
// event references, for a partner-scoped operator's dashboard.
// WHY: Reusing the global collectTryOnDashboardMetrics for a partner-scoped
// session would leak every other partner's queue/vetting counts. Worker health
// is deliberately omitted here — it describes shared infrastructure, not this
// partner's events.
export async function collectScopedTryOnDashboardMetrics(
  db: Db,
  eventUuids: string[],
  eventMongoIds: string[]
): Promise<{ pendingVettingCount: number; activeQueueTotal: number }> {
  if (eventUuids.length === 0 && eventMongoIds.length === 0) {
    return { pendingVettingCount: 0, activeQueueTotal: 0 };
  }
  const [pendingVettingCount, activeQueueTotal] = await Promise.all([
    db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
      submissionKind: 'tryon_result',
      reviewStatus: 'pending_review',
      'tryOnModerationArchive.archived': { $ne: true },
      $or: [{ eventId: { $in: eventUuids } }, { eventIds: { $elemMatch: { $in: eventUuids } } }],
    }),
    db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments({
      status: { $in: [...WORKER_OWNED_TRYON_QUEUE_STATUSES] },
      'source.eventMongoId': { $in: eventMongoIds },
    }),
  ]);
  return { pendingVettingCount, activeQueueTotal };
}

export async function collectTryOnDashboardMetrics(db: Db): Promise<TryOnDashboardMetrics> {
  const [queueStatusCounts, activeSuits, totalSuits, pendingVetting, runningJobs, latestHeartbeat] = await Promise.all([
    db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray(),
    db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).countDocuments({ active: true }),
    db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).countDocuments({}),
    db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
      submissionKind: 'tryon_result',
      reviewStatus: 'pending_review',
      'tryOnModerationArchive.archived': { $ne: true },
    }),
    db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find({ status: { $in: [...WORKER_OWNED_TRYON_QUEUE_STATUSES] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection<TryOnWorkerHeartbeat>(COLLECTIONS.TRYON_WORKER_HEARTBEATS)
      .find({})
      .sort({ updatedAt: -1 })
      .limit(1)
      .next(),
  ]);

  const queueCounts = Object.fromEntries(queueStatusCounts.map((item) => [item._id, item.count]));
  return {
    queueCounts,
    activeQueueTotal: activeTryOnQueueTotal(queueCounts),
    activeSuitCount: activeSuits,
    totalSuitCount: totalSuits,
    pendingVettingCount: pendingVetting,
    workerHealth: summarizeTryOnWorkerHealth(runningJobs, activeTryOnQueueTotal(queueCounts), latestHeartbeat),
  };
}
