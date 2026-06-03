import { createHash, randomUUID } from 'node:crypto';

export function buildTryOnRequestHash(
  submissionId: string,
  leatherSuitId: string,
  pipelineVersion: string,
  setupId?: string | null
): string {
  const normalizedSetupId = typeof setupId === 'string' && setupId.trim() ? setupId.trim() : null;
  return createHash('sha256')
    .update(`${submissionId}:${leatherSuitId}:${pipelineVersion}:${normalizedSetupId || ''}`)
    .digest('hex');
}

export function createTryOnJobId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `job_${stamp}_${randomUUID().slice(0, 8)}`;
}
