import type { Db, ObjectId, WithId } from 'mongodb';
import {
  COLLECTIONS,
  type Submission,
  type SubmissionTryOnLink,
  type TryOnJob,
  type TryOnJobError,
  type TryOnJobStage,
  type TryOnJobStatus,
} from '@/lib/db/schemas';
import { buildTryOnRequestHash, createTryOnJobId } from '@/lib/tryon/hash';
import { nowIso, plusMinutes, plusSeconds } from '@/lib/tryon/time';

export const TRYON_PIPELINE = 'motogp_leather_magic' as const;
export const TRYON_PIPELINE_VERSION = '1.0.0';

export interface CreateTryOnJobInput {
  submissionId: string;
  imageUrl: string;
  leatherSuitId: string;
  eventId?: string | null;
  eventMongoId?: string | null;
  partnerId?: string | null;
  userId?: string | null;
}

export interface TryOnJobLinkResult {
  job: WithId<TryOnJob>;
  deduplicated: boolean;
}

export interface WorkerRuntimeConfig {
  workerId: string;
  pollIntervalSeconds: number;
  leaseDurationSeconds: number;
  maxAttempts: number;
}

export function buildQueuedTryOnJob(input: CreateTryOnJobInput): TryOnJob {
  const createdAt = nowIso();
  const normalizedSubmissionId = input.submissionId.trim();
  const normalizedSuitId = input.leatherSuitId.trim();

  return {
    jobId: createTryOnJobId(),
    requestHash: buildTryOnRequestHash(
      normalizedSubmissionId,
      normalizedSuitId,
      TRYON_PIPELINE_VERSION
    ),
    status: 'queued',
    stage: 'queued',
    pipeline: TRYON_PIPELINE,
    pipelineVersion: TRYON_PIPELINE_VERSION,
    source: {
      app: 'camera',
      submissionId: normalizedSubmissionId,
      imageUrl: input.imageUrl,
      eventId: input.eventId ?? null,
      eventMongoId: input.eventMongoId ?? null,
      partnerId: input.partnerId ?? null,
      userId: input.userId ?? null,
    },
    request: {
      leatherSuitId: normalizedSuitId,
    },
    processing: {
      attemptCount: 0,
      nextAttemptAt: createdAt,
      workerId: null,
      claimedAt: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
    },
    result: {
      publicResultUrl: null,
      imgbbDeleteUrl: null,
      provider: null,
    },
    error: {
      code: null,
      message: null,
      details: null,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export async function findTryOnJobByRequestHash(
  db: Db,
  requestHash: string
): Promise<WithId<TryOnJob> | null> {
  return db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ requestHash });
}

export async function insertOrGetTryOnJob(
  db: Db,
  input: CreateTryOnJobInput
): Promise<TryOnJobLinkResult> {
  const job = buildQueuedTryOnJob(input);

  try {
    const result = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).insertOne(job);
    return {
      job: {
        _id: result.insertedId,
        ...job,
      },
      deduplicated: false,
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 11000) {
      const existing = await findTryOnJobByRequestHash(db, job.requestHash);
      if (existing) {
        return { job: existing, deduplicated: true };
      }
    }

    throw error;
  }
}

export async function upsertSubmissionTryOnLink(
  db: Db,
  submissionObjectId: ObjectId,
  link: SubmissionTryOnLink
): Promise<void> {
  const submissions = db.collection<Submission>(COLLECTIONS.SUBMISSIONS);

  const existing = await submissions.updateOne(
    { _id: submissionObjectId, 'tryOnJobs.jobId': link.jobId },
    {
      $set: {
        'tryOnJobs.$.status': link.status,
        'tryOnJobs.$.resultUrl': link.resultUrl ?? null,
        'tryOnJobs.$.updatedAt': link.updatedAt,
      },
    }
  );

  if (existing.matchedCount > 0) {
    return;
  }

  await submissions.updateOne(
    { _id: submissionObjectId },
    {
      $push: {
        tryOnJobs: link,
      },
    }
  );
}

export function buildSubmissionTryOnLink(
  job: TryOnJob,
  status: TryOnJobStatus,
  resultUrl?: string | null
): SubmissionTryOnLink {
  return {
    jobId: job.jobId,
    leatherSuitId: job.request.leatherSuitId,
    status,
    resultUrl: resultUrl ?? null,
    createdAt: job.createdAt,
    updatedAt: nowIso(),
  };
}

export async function claimNextTryOnJob(
  db: Db,
  workerId: string,
  leaseDurationSeconds: number
): Promise<WithId<TryOnJob> | null> {
  const now = nowIso();
  const result = await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOneAndUpdate(
    {
      status: { $in: ['queued', 'retry_wait'] },
      'processing.nextAttemptAt': { $lte: now },
      $or: [
        { 'processing.leaseExpiresAt': null },
        { 'processing.leaseExpiresAt': { $lt: now } },
      ],
    },
    {
      $set: {
        status: 'claimed',
        stage: 'claimed',
        'processing.workerId': workerId,
        'processing.claimedAt': now,
        'processing.leaseExpiresAt': plusSeconds(now, leaseDurationSeconds),
        updatedAt: now,
      },
      $inc: {
        'processing.attemptCount': 1,
      },
    },
    {
      sort: { createdAt: 1 },
      returnDocument: 'after',
    }
  );

  return result;
}

export async function markTryOnJobStage(
  db: Db,
  jobId: string,
  status: TryOnJobStatus,
  stage: TryOnJobStage,
  patch: Record<string, unknown> = {}
): Promise<void> {
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId },
    {
      $set: {
        status,
        stage,
        updatedAt: nowIso(),
        ...patch,
      },
    }
  );
}

export async function heartbeatTryOnJob(
  db: Db,
  jobId: string,
  leaseDurationSeconds: number
): Promise<void> {
  const now = nowIso();
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId },
    {
      $set: {
        'processing.lastHeartbeatAt': now,
        'processing.leaseExpiresAt': plusSeconds(now, leaseDurationSeconds),
        updatedAt: now,
      },
    }
  );
}

export function classifyTryOnFailure(error: unknown): {
  transient: boolean;
  code: string;
  message: string;
  details: string | null;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('imgbb') ||
    lower.includes('fetch failed')
  ) {
    return {
      transient: true,
      code: 'transient_runtime_error',
      message: raw,
      details: null,
    };
  }

  if (lower.includes('invalid_leather_suit_id') || lower.includes('missing suit')) {
    return {
      transient: false,
      code: 'invalid_suit',
      message: raw,
      details: null,
    };
  }

  if (lower.includes('allowlisted') || lower.includes('oversized')) {
    return {
      transient: false,
      code: 'invalid_source_image',
      message: raw,
      details: null,
    };
  }

  return {
    transient: false,
    code: 'processing_failed',
    message: raw,
    details: null,
  };
}

export function retryDelayMinutes(attemptCount: number): number | null {
  if (attemptCount <= 1) return 5;
  if (attemptCount === 2) return 30;
  return null;
}

export async function scheduleTryOnRetryOrFailure(
  db: Db,
  job: WithId<TryOnJob>,
  error: TryOnJobError,
  maxAttempts: number
): Promise<'retry_wait' | 'failed'> {
  const attemptCount = job.processing.attemptCount;
  const delayMinutes = attemptCount < maxAttempts ? retryDelayMinutes(attemptCount) : null;
  const now = nowIso();

  if (delayMinutes != null) {
    await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
      { jobId: job.jobId },
      {
        $set: {
          status: 'retry_wait',
          stage: 'failed',
          error,
          updatedAt: now,
          'processing.nextAttemptAt': plusMinutes(now, delayMinutes),
          'processing.leaseExpiresAt': null,
        },
      }
    );
    return 'retry_wait';
  }

  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId: job.jobId },
    {
      $set: {
        status: 'failed',
        stage: 'failed',
        error,
        updatedAt: now,
        'processing.finishedAt': now,
        'processing.leaseExpiresAt': null,
      },
    }
  );
  return 'failed';
}

export async function recoverStaleTryOnJobs(db: Db): Promise<number> {
  const now = nowIso();
  const result = await db.collection(COLLECTIONS.TRYON_JOBS).updateMany(
    {
      status: { $in: ['claimed', 'processing', 'uploading_result'] },
      'processing.leaseExpiresAt': { $lt: now },
    },
    {
      $set: {
        status: 'retry_wait',
        updatedAt: now,
        'processing.nextAttemptAt': plusMinutes(now, 5),
        'processing.leaseExpiresAt': null,
      },
    }
  );

  return result.modifiedCount;
}

export async function markTryOnJobDone(
  db: Db,
  jobId: string,
  publicResultUrl: string,
  deleteUrl?: string | null
): Promise<void> {
  const now = nowIso();
  await db.collection(COLLECTIONS.TRYON_JOBS).updateOne(
    { jobId },
    {
      $set: {
        status: 'done',
        stage: 'done',
        updatedAt: now,
        'processing.finishedAt': now,
        'processing.leaseExpiresAt': null,
        result: {
          publicResultUrl,
          imgbbDeleteUrl: deleteUrl ?? null,
          provider: 'imgbb',
        },
        error: {
          code: null,
          message: null,
          details: null,
        },
      },
    }
  );
}

export async function getTryOnJobByJobId(
  db: Db,
  jobId: string
): Promise<WithId<TryOnJob> | null> {
  return db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).findOne({ jobId });
}
