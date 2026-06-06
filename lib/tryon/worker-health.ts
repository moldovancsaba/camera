import type { TryOnJob, TryOnWorkerHeartbeat } from '@/lib/db/schemas';

export type TryOnWorkerHealthState = 'online' | 'offline' | 'stale' | 'idle' | 'unknown';

export interface TryOnWorkerHealthSummary {
  state: TryOnWorkerHealthState;
  workerId: string | null;
  activeJobId: string | null;
  activeStage: string | null;
  lastHeartbeatAt: string | null;
  leaseExpiresAt: string | null;
  activeJobCount: number;
  staleJobCount: number;
}

const STALE_AFTER_MS = 2 * 60 * 1000;

function timeValue(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function isTryOnWorkerJobStale(job: Partial<TryOnJob>, nowMs = Date.now()) {
  const leaseExpiresAt = timeValue(job.processing?.leaseExpiresAt);
  if (leaseExpiresAt && leaseExpiresAt < nowMs) {
    return true;
  }

  const heartbeatAt =
    timeValue(job.processing?.lastHeartbeatAt) ??
    timeValue(job.updatedAt) ??
    timeValue(job.processing?.claimedAt);

  if (!heartbeatAt) {
    return true;
  }

  return nowMs - heartbeatAt > STALE_AFTER_MS;
}

export function summarizeTryOnWorkerHealth(
  runningJobs: Array<Partial<TryOnJob>>,
  activeQueueCount: number,
  latestHeartbeat: Partial<TryOnWorkerHeartbeat> | null = null,
  nowMs = Date.now()
): TryOnWorkerHealthSummary {
  const staleJobs = runningJobs.filter((job) => isTryOnWorkerJobStale(job, nowMs));
  const primaryJob = runningJobs[0] ?? null;

  if (runningJobs.length > 0) {
    return {
      state: staleJobs.length > 0 ? 'stale' : 'online',
      workerId: primaryJob?.processing?.workerId ?? null,
      activeJobId: primaryJob?.jobId ?? null,
      activeStage: primaryJob?.stage ?? null,
      lastHeartbeatAt: primaryJob?.processing?.lastHeartbeatAt ?? primaryJob?.updatedAt ?? null,
      leaseExpiresAt: primaryJob?.processing?.leaseExpiresAt ?? null,
      activeJobCount: runningJobs.length,
      staleJobCount: staleJobs.length,
    };
  }

  if (activeQueueCount > 0) {
    const heartbeatAt = timeValue(latestHeartbeat?.lastHeartbeatAt) ?? timeValue(latestHeartbeat?.updatedAt);
    const heartbeatFresh = heartbeatAt !== null && nowMs - heartbeatAt <= STALE_AFTER_MS;
    if (latestHeartbeat?.workerRunning && heartbeatFresh) {
      return {
        state: 'online',
        workerId: latestHeartbeat.workerId ?? null,
        activeJobId: latestHeartbeat.currentJobId ?? null,
        activeStage: latestHeartbeat.currentJobId ? 'active' : 'idle',
        lastHeartbeatAt: latestHeartbeat.lastHeartbeatAt ?? latestHeartbeat.updatedAt ?? null,
        leaseExpiresAt: null,
        activeJobCount: 0,
        staleJobCount: 0,
      };
    }
    return {
      state: 'offline',
      workerId: null,
      activeJobId: null,
      activeStage: null,
      lastHeartbeatAt: null,
      leaseExpiresAt: null,
      activeJobCount: 0,
      staleJobCount: 0,
    };
  }

  if (latestHeartbeat?.workerRunning) {
    const heartbeatAt = timeValue(latestHeartbeat.lastHeartbeatAt) ?? timeValue(latestHeartbeat.updatedAt);
    const heartbeatFresh = heartbeatAt !== null && nowMs - heartbeatAt <= STALE_AFTER_MS;
    return {
      state: heartbeatFresh ? 'idle' : 'stale',
      workerId: latestHeartbeat.workerId ?? null,
      activeJobId: latestHeartbeat.currentJobId ?? null,
      activeStage: latestHeartbeat.currentJobId ? 'active' : null,
      lastHeartbeatAt: latestHeartbeat.lastHeartbeatAt ?? latestHeartbeat.updatedAt ?? null,
      leaseExpiresAt: null,
      activeJobCount: 0,
      staleJobCount: heartbeatFresh ? 0 : 1,
    };
  }

  return {
    state: 'idle',
    workerId: null,
    activeJobId: null,
    activeStage: null,
    lastHeartbeatAt: null,
    leaseExpiresAt: null,
    activeJobCount: 0,
    staleJobCount: 0,
  };
}

export function formatTryOnWorkerHealthTitle(summary: TryOnWorkerHealthSummary) {
  if (summary.state === 'online') return 'Worker Online';
  if (summary.state === 'stale') return 'Worker Stale';
  if (summary.state === 'offline') return 'Worker Offline';
  if (summary.state === 'idle') return 'Worker Idle';
  return 'Worker Unknown';
}

export function formatTryOnWorkerHealthDescription(summary: TryOnWorkerHealthSummary) {
  if (summary.activeJobId) {
    return `${summary.workerId ?? 'Worker'} · ${summary.activeJobId} · ${summary.activeStage ?? 'active'}`;
  }
  if (summary.state === 'offline') {
    return 'Active jobs are waiting, but no worker currently owns a job.';
  }
  if (summary.state === 'idle') {
    return summary.workerId
      ? `${summary.workerId} is online with no active queue work.`
      : 'No active queue work is currently assigned to the local worker.';
  }
  return 'Worker health could not be determined from current job leases.';
}
