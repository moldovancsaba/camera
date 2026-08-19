import { createHash, randomUUID } from 'node:crypto';

export function buildTryOnRequestHash(
  submissionId: string,
  leatherSuitId: string,
  pipelineVersion: string,
  setupId?: string | null,
  outfitBottomLeatherSuitId?: string | null
): string {
  const normalizedSetupId = typeof setupId === 'string' && setupId.trim() ? setupId.trim() : null;
  const normalizedBottomId =
    typeof outfitBottomLeatherSuitId === 'string' && outfitBottomLeatherSuitId.trim()
      ? outfitBottomLeatherSuitId.trim()
      : null;
  // Null-safe by construction (try-on#39's contract requirement): without a
  // bottom the hash input is byte-identical to the pre-outfit implementation,
  // so no existing dedup behavior shifts on deploy — while a top-only job and
  // a top+bottom job for the same submission can never collide.
  const base = `${submissionId}:${leatherSuitId}:${pipelineVersion}:${normalizedSetupId || ''}`;
  return createHash('sha256')
    .update(normalizedBottomId ? `${base}:outfit-bottom:${normalizedBottomId}` : base)
    .digest('hex');
}

export function createTryOnJobId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `job_${stamp}_${randomUUID().slice(0, 8)}`;
}
