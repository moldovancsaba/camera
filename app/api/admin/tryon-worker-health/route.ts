import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { activeTryOnQueueTotal } from '@/lib/tryon/queue-status';
import { summarizeTryOnWorkerHealth } from '@/lib/tryon/worker-health';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const db = await connectToDatabase();
  const [queueStatusCounts, runningJobs] = await Promise.all([
    db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find({ status: { $in: ['claimed', 'processing', 'uploading_result'] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  const queueCounts = Object.fromEntries(queueStatusCounts.map((item) => [item._id, item.count]));
  const summary = summarizeTryOnWorkerHealth(runningJobs, activeTryOnQueueTotal(queueCounts));

  return apiSuccess({
    worker: summary,
    runningJobs: runningJobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      stage: job.stage,
      workerId: job.processing.workerId ?? null,
      lastHeartbeatAt: job.processing.lastHeartbeatAt ?? null,
      leaseExpiresAt: job.processing.leaseExpiresAt ?? null,
      updatedAt: job.updatedAt,
    })),
  });
});
