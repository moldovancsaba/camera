import type { Filter } from 'mongodb';
import type { TryOnJob, TryOnJobStatus } from '@/lib/db/schemas';

export const ACTIVE_TRYON_QUEUE_STATUSES = [
  'queued',
  'claimed',
  'processing',
  'uploading_result',
  'notifying_camera',
  'retry_wait',
] as const;

export const HISTORICAL_TRYON_QUEUE_STATUSES = [
  'done',
  'failed',
] as const;

export type ActiveTryOnQueueStatus = (typeof ACTIVE_TRYON_QUEUE_STATUSES)[number];
export type HistoricalTryOnQueueStatus = (typeof HISTORICAL_TRYON_QUEUE_STATUSES)[number];
export const WORKER_OWNED_TRYON_QUEUE_STATUSES = ['claimed', 'processing', 'uploading_result', 'notifying_camera'] as const;

export function isActiveTryOnQueueStatus(status: string | null | undefined): status is ActiveTryOnQueueStatus {
  return ACTIVE_TRYON_QUEUE_STATUSES.includes(status as ActiveTryOnQueueStatus);
}

export function activeTryOnQueueTotal(counts: Record<string, number>) {
  return ACTIVE_TRYON_QUEUE_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export function processingTryOnQueueTotal(counts: Record<string, number>) {
  return WORKER_OWNED_TRYON_QUEUE_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export function formatActiveTryOnQueueSummary(counts: Record<string, number>) {
  return [
    `Queued ${counts.queued ?? 0}`,
    `Processing ${processingTryOnQueueTotal(counts)}`,
    `Notifying ${counts.notifying_camera ?? 0}`,
    `Retry ${counts.retry_wait ?? 0}`,
  ].join(' · ');
}

export function buildTryOnQueueStatusCountsQuery(baseQuery: Filter<TryOnJob>, status: TryOnJobStatus): Filter<TryOnJob> {
  return {
    ...baseQuery,
    status,
  };
}
