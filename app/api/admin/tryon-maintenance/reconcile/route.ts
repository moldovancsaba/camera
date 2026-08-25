import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { applyCompletionFromJobResult } from '@/lib/tryon/completion';

const MAX_LIMIT = 50;

/**
 * POST /api/admin/tryon-maintenance/reconcile
 * Admin-UI counterpart to scripts/reconcile-tryon-done-jobs.ts, scoped down
 * for a single HTTP request: a small, capped batch (not the script's
 * unbounded --all) and no dry-run branch of its own -- the actual write,
 * applyCompletionFromJobResult, is imported and shared with the script
 * rather than reimplemented, so there is exactly one place that logic lives.
 * Body: { dryRun: boolean, limit?: number (default 10, max 50) }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; limit?: number };
  const dryRun = body.dryRun !== false;
  const limit = Number.isFinite(body.limit) && Number(body.limit) > 0 ? Math.min(Math.floor(Number(body.limit)), MAX_LIMIT) : 10;

  const db = await connectToDatabase();
  const candidates = await db
    .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
    .find({ status: 'done', 'result.publicResultUrl': { $type: 'string' } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();

  if (dryRun) {
    // Dry run reports what WOULD be scanned -- it deliberately doesn't call
    // applyCompletionFromJobResult (even in some hypothetical read-only
    // mode) because determining created/updated/unchanged requires the same
    // lookups the real apply does; a fabricated dry-run outcome would be a
    // guess dressed up as a preview. What we can honestly show up front is
    // which jobs are in scope for this batch.
    return apiSuccess({
      dryRun: true,
      scanned: candidates.length,
      jobs: candidates.map((job) => ({ jobId: job.jobId, sourceSubmissionId: job.source?.submissionId ?? null, updatedAt: job.updatedAt })),
    });
  }

  const outcomes: Array<{ jobId: string; action?: string; resultSubmissionId?: string | null; error?: string }> = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const job of candidates) {
    try {
      const result = await applyCompletionFromJobResult(db, job);
      if (result.action === 'created') created += 1;
      else if (result.action === 'updated') updated += 1;
      else unchanged += 1;
      outcomes.push({ jobId: job.jobId, action: result.action, resultSubmissionId: result.resultSubmissionId });
    } catch (error) {
      failed += 1;
      outcomes.push({ jobId: job.jobId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return apiSuccess({
    dryRun: false,
    scanned: candidates.length,
    created,
    updated,
    unchanged,
    failed,
    jobs: outcomes,
  });
});
