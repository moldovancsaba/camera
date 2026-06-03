/**
 * Backfill utility for done try-on jobs missing/without framed result variants.
 *
 * Usage:
 *   npx tsx scripts/reconcile-tryon-done-jobs.ts
 *   npx tsx scripts/reconcile-tryon-done-jobs.ts --dry-run
 *   npx tsx scripts/reconcile-tryon-done-jobs.ts --limit=200 --status=done
 *   npx tsx scripts/reconcile-tryon-done-jobs.ts --job-id=<jobId>
 *   npx tsx scripts/reconcile-tryon-done-jobs.ts --all
 */

import { loadEnvFromFiles } from './load-env-from-files';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { applyCompletionFromJobResult } from '@/lib/tryon/completion';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';

interface ReconcileOptions {
  dryRun: boolean;
  status: string;
  limit: number | null;
  all: boolean;
  jobId?: string;
}

interface ReconcileCounters {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  skipped: number;
}

function parseArgs(): ReconcileOptions {
  const args = process.argv.slice(2);
  const statusArg = args.find((value) => value.startsWith('--status='));
  const jobArg = args.find((value) => value.startsWith('--job-id='));
  const limitArg = args.find((value) => value.startsWith('--limit='));

  const rawLimit = limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : NaN;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;

  return {
    dryRun: args.includes('--dry-run'),
    status: statusArg ? statusArg.replace('--status=', '').trim() : 'done',
    limit,
    all: args.includes('--all'),
    jobId: jobArg?.replace('--job-id=', '').trim(),
  };
}

function formatOutcomeAction(action: 'created' | 'updated' | 'unchanged' | 'skipped') {
  if (action === 'created') return 'CREATED';
  if (action === 'updated') return 'UPDATED';
  if (action === 'unchanged') return 'UNCHANGED';
  return 'SKIPPED';
}

async function reconcileJob(db: Awaited<ReturnType<typeof connectToDatabase>>, jobId: string, dryRun: boolean) {
  const job = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ jobId });
  if (!job) {
    return { action: 'skipped' as const, jobId, reason: 'job_not_found' };
  }

  if (!job.result?.publicResultUrl) {
    return { action: 'skipped' as const, jobId, reason: 'missing_result_url' };
  }

  if (!dryRun) {
    const result = await applyCompletionFromJobResult(db, job);
    return {
      action: result.action,
      jobId,
      resultSubmissionId: result.resultSubmissionId,
      publicationStatus: result.publicationStatus,
      publicationVisible: result.publicationVisible,
    };
  }

  return {
    action: 'unchanged' as const,
    jobId,
    reason: 'dry_run',
  };
}

async function runWithFilter(db: Awaited<ReturnType<typeof connectToDatabase>>, options: ReconcileOptions) {
  if (options.jobId && options.jobId.length > 0) {
    const single = await reconcileJob(db, options.jobId, options.dryRun);
    const label = formatOutcomeAction(single.action);
    console.log(`✅ [${single.jobId}] ${label}${single.reason ? ` (${single.reason})` : ''}`);
    return;
  }

  const query: Record<string, unknown> = {
    status: options.status,
    'result.publicResultUrl': { $type: 'string' },
  };

  const batchSize = 100;
  const hardLimit = options.limit ?? (options.all ? Number.MAX_SAFE_INTEGER : 500);

  const counters: ReconcileCounters = {
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    skipped: 0,
  };

  let processed = 0;
  let offset = 0;
  while (processed < hardLimit) {
    const fetchSize = Math.min(batchSize, hardLimit - processed);
    const jobs = await db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(offset)
      .limit(fetchSize)
      .toArray();

    if (!jobs.length) {
      break;
    }

    for (const job of jobs) {
      if (processed >= hardLimit) break;
      processed += 1;
      counters.scanned += 1;

      const sourceId = job.source?.submissionId ?? '<unknown>';
      const jobId = job.jobId;

      try {
        const result = await reconcileJob(db, jobId, options.dryRun);
        if (result.action === 'created') {
          counters.created += 1;
        } else if (result.action === 'updated') {
          counters.updated += 1;
        } else if (result.action === 'unchanged') {
          counters.unchanged += 1;
        } else {
          counters.skipped += 1;
        }

        if (options.dryRun) {
          console.log(`[DRY] [${jobId}] source=${sourceId} => ${formatOutcomeAction(result.action)}${result.reason ? ` (${result.reason})` : ''}`);
          continue;
        }

        if (result.action === 'created') {
          console.log(`✅ [${jobId}] source=${sourceId} => CREATED result=${result.resultSubmissionId}`);
        } else if (result.action === 'updated') {
          console.log(`♻️  [${jobId}] source=${sourceId} => UPDATED`);
        } else {
          console.log(`⏸  [${jobId}] source=${sourceId} => ${formatOutcomeAction(result.action)}`);
        }
      } catch (error: unknown) {
        counters.failed += 1;
        const message = error instanceof Error ? error.message : 'unknown';
        console.error(`❌ [${jobId}] source=${sourceId} failed: ${message}`);
      }
    }

    if (jobs.length < fetchSize) {
      break;
    }

    offset += jobs.length;
  }

  console.log(`\nSummary (${nowIso()}):`);
  console.log(`  scanned:   ${counters.scanned}`);
  console.log(`  created:   ${counters.created}`);
  console.log(`  updated:   ${counters.updated}`);
  console.log(`  unchanged: ${counters.unchanged}`);
  console.log(`  skipped:   ${counters.skipped}`);
  console.log(`  failed:    ${counters.failed}`);
  console.log(`  dryRun:    ${options.dryRun ? 'yes' : 'no'}`);
}

async function main() {
  loadEnvFromFiles();
  const options = parseArgs();

  const db = await connectToDatabase();
  try {
    await runWithFilter(db, options);
  } finally {
    await closeConnection();
  }
}

main().catch(async (error: unknown) => {
  console.error('Failed to reconcile done try-on jobs:', error);
  await closeConnection().catch(() => {});
  process.exitCode = 1;
});
