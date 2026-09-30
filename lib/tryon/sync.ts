/**
 * Try-on completion backstop: job selection for GET/POST /api/internal/tryon/sync.
 *
 * WHAT: Picks the try-on jobs whose result was published (status done, or
 *     retry_wait/failed when asked, with a stored result.publicResultUrl) but
 *     whose completion camera never applied, so the sync route only calls
 *     applyCompletionFromJobResult for work that is actually missing.
 * WHY (CAM-02): The route used to take the newest N jobs by updatedAt and
 *     re-apply every one of them on every run. Each re-apply uploads a new
 *     preview (and, for framed events, re-frames the already-framed result and
 *     uploads a new composite), rewrites the derived submission, and bumps the
 *     job's updatedAt, so the same jobs sorted first again five minutes later.
 *     With CRON_SECRET set that is thousands of blob writes a day, frames
 *     stacked on frames, and a superseded job flipping its source submission
 *     back from the rerun job. Selecting only unapplied jobs makes a run with
 *     nothing new a pure read.
 *
 * Completion markers (both are written by existing code, nothing new is stored):
 *  - a derived try-on result submission with sourceJobId = job.jobId, which
 *    applyTryOnCompletion (lib/tryon/completion.ts) writes on both its create
 *    and its update path. A rerun archives the superseded result but keeps
 *    the document, so a superseded job stays applied.
 *  - a 'remove' moderation event for the job. POST
 *    /api/admin/tryon-results/[submissionId]/remove hard-deletes the derived
 *    submission but leaves the job done with its result URL; without this
 *    marker the backstop would re-create a result an admin deleted. It is the
 *    only way to delete a try-on result: the generic DELETE
 *    /api/submissions/[submissionId] answers 409 for one, because it records
 *    no such event.
 * Re-applying a job that is already applied is an explicit operator action:
 *     POST /api/admin/tryon-jobs/[jobId]/reapply-result.
 */

import type { Db, Filter, WithId } from 'mongodb';
import {
  COLLECTIONS,
  type Submission,
  type TryOnJob,
  type TryOnModerationEvent,
} from '@/lib/db/schemas';

// WHAT: The one job id shape camera mints: createTryOnJobId (lib/tryon/hash.ts)
//     returns `job_<yyyyMMddHHmmss>_<first 8 hex chars of a UUID>`.
// WHY (CAM-09): The route used to require a Mongo ObjectId here, which no job
//     id ever is, so `?jobId=` always answered 400. Every job in the live
//     collection matches this pattern (read-only count, 2026-09-29: 619/619).
export const TRYON_JOB_ID_PATTERN = /^job_\d{14}_[0-9a-f]{8}$/;

export function isTryOnJobId(value: unknown): value is string {
  return typeof value === 'string' && TRYON_JOB_ID_PATTERN.test(value);
}

export const TRYON_SYNC_STATUSES = ['done', 'retry_wait', 'failed'] as const;
export type TryOnSyncStatus = (typeof TRYON_SYNC_STATUSES)[number];

export function isTryOnSyncStatus(value: unknown): value is TryOnSyncStatus {
  return typeof value === 'string' && (TRYON_SYNC_STATUSES as readonly string[]).includes(value);
}

export interface PendingCompletionFilter {
  status: TryOnSyncStatus;
  jobId?: string | null;
  limit: number;
}

export interface PendingCompletionSelection {
  // Unapplied jobs, newest updatedAt first, at most `limit` of them.
  jobs: WithId<TryOnJob>[];
  // Jobs that matched the filter but were skipped because a completion
  // marker already exists for them.
  alreadyApplied: number;
}

// Keeps each `$in` list well inside the 16 MB command limit as the jobs
// collection grows; one chunk covers the whole collection today.
const JOB_ID_CHUNK_SIZE = 500;

export function buildEligibleJobsQuery(filter: Pick<PendingCompletionFilter, 'status' | 'jobId'>): Filter<TryOnJob> {
  const jobId = filter.jobId?.trim();
  return {
    status: filter.status,
    'result.publicResultUrl': { $type: 'string' },
    ...(jobId ? { jobId } : {}),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Returns the subset of `jobIds` that already carry a completion marker (see
 * the module comment). Reads only.
 */
export async function findAppliedTryOnJobIds(db: Db, jobIds: string[]): Promise<Set<string>> {
  const applied = new Set<string>();
  const uniqueIds = Array.from(new Set(jobIds.filter((id) => typeof id === 'string' && id.length > 0)));

  for (const ids of chunk(uniqueIds, JOB_ID_CHUNK_SIZE)) {
    const [derivedResults, removalEvents] = await Promise.all([
      db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .find<{ sourceJobId?: string | null }>(
          { sourceJobId: { $in: ids } },
          { projection: { _id: 0, sourceJobId: 1 } }
        )
        .toArray(),
      db
        .collection<TryOnModerationEvent>(COLLECTIONS.TRYON_MODERATION_EVENTS)
        .find<{ sourceJobId?: string | null }>(
          { action: 'remove', sourceJobId: { $in: ids } },
          { projection: { _id: 0, sourceJobId: 1 } }
        )
        .toArray(),
    ]);

    for (const marker of [...derivedResults, ...removalEvents]) {
      if (typeof marker.sourceJobId === 'string') {
        applied.add(marker.sourceJobId);
      }
    }
  }

  return applied;
}

/**
 * Which URL a re-application of a completed job starts from
 * (applyCompletionFromJobResult in lib/tryon/completion.ts).
 *
 * WHAT: The derived result's metadata.tryOnRawResultUrl (the unframed worker
 *     output) when one is stored, otherwise the job's own result URL.
 * WHY (CAM-02): After the first completion, job.result.publicResultUrl is the
 *     framed composite, so framing it again stacks a second frame. The job's
 *     delete URL belongs to that composite, never to the raw image, so it is
 *     only passed on when the job's own URL is the one used.
 */
export function resolveCompletionReapplySource(
  jobResult: Pick<TryOnJob['result'], 'publicResultUrl' | 'imgbbDeleteUrl'>,
  storedRawResultUrl: unknown
): { publicResultUrl: string; deleteUrl: string | null } {
  const jobResultUrl = typeof jobResult.publicResultUrl === 'string' ? jobResult.publicResultUrl.trim() : '';
  const rawResultUrl = typeof storedRawResultUrl === 'string' ? storedRawResultUrl.trim() : '';

  if (rawResultUrl && rawResultUrl !== jobResultUrl) {
    return { publicResultUrl: rawResultUrl, deleteUrl: null };
  }

  return { publicResultUrl: jobResultUrl, deleteUrl: jobResult.imgbbDeleteUrl ?? null };
}

/**
 * Selects the jobs the sync backstop should apply. Reads only: the ids of
 * every job that matches the filter, the completion markers for those ids,
 * then the full documents of at most `limit` unapplied ones. The limit is
 * applied after the markers are checked, so already-applied jobs never use up
 * a run's budget and an older unapplied job is still reached.
 */
export async function selectJobsPendingCompletion(
  db: Db,
  filter: PendingCompletionFilter
): Promise<PendingCompletionSelection> {
  const jobs = db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS);
  const query = buildEligibleJobsQuery(filter);

  const eligible = await jobs
    .find<{ jobId?: string }>(query, { projection: { _id: 0, jobId: 1 } })
    .sort({ updatedAt: -1 })
    .toArray();
  const eligibleIds = eligible
    .map((job) => job.jobId)
    .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0);

  const applied = await findAppliedTryOnJobIds(db, eligibleIds);
  const alreadyApplied = eligibleIds.filter((jobId) => applied.has(jobId)).length;
  const pendingIds = eligibleIds
    .filter((jobId) => !applied.has(jobId))
    .slice(0, Math.max(0, filter.limit));

  if (pendingIds.length === 0) {
    return { jobs: [], alreadyApplied };
  }

  // Re-checks status/result with the ids so a job that changed between the
  // two reads is dropped rather than applied from a stale state.
  const pendingJobs = await jobs
    .find({ ...query, jobId: { $in: pendingIds } })
    .sort({ updatedAt: -1 })
    .toArray();

  return { jobs: pendingJobs, alreadyApplied };
}
