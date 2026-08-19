import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { assertInternalTryOnSecret, applyCompletionFromJobResult } from '@/lib/tryon/completion';

interface SyncPayload {
  limit?: number;
  jobId?: string;
  status?: string;
}

const allowedSyncStatuses = new Set(['done', 'retry_wait', 'failed']);

function parseLimit(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 25;
}

function parseStatus(rawValue: string | null): string {
  const candidate = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!candidate) return '';
  return allowedSyncStatuses.has(candidate) ? candidate : '';
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalTryOnSecret(request);
  const body = (await request.json().catch(() => ({}))) as Partial<SyncPayload>;
  const searchParams = request.nextUrl.searchParams;
  const payload: SyncPayload = {
    limit: body.limit ?? parseLimit(searchParams.get('limit')),
    jobId: body.jobId || searchParams.get('jobId')?.trim(),
    status: parseStatus(body.status?.toString() || searchParams.get('status')),
  };

  return syncJobs(payload);
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  // SECURITY (camera#119): the previous branch trusted a client-settable
  // `x-vercel-cron` header, so anyone could trigger this. Now require EITHER the
  // internal try-on secret (service calls) OR Vercel's own `Authorization: Bearer
  // <CRON_SECRET>` (which Vercel injects into cron invocations when CRON_SECRET is
  // set). Neither is spoofable; if CRON_SECRET is unset the cron path fails closed.
  const requestSecret = request.headers.get('x-camera-tryon-secret')?.trim();
  if (requestSecret) {
    assertInternalTryOnSecret(request);
  } else {
    const cronSecret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      throw apiForbidden('valid cron authorization is required for unauthenticated sync');
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const payload: SyncPayload = {
    limit: parseLimit(searchParams.get('limit')),
    jobId: searchParams.get('jobId')?.trim() || undefined,
    status: parseStatus(searchParams.get('status')),
  };

  return syncJobs(payload);
});

async function syncJobs(payload: SyncPayload) {
  const db = await connectToDatabase();
  const statusFilter = payload.status || 'done';
  if (!allowedSyncStatuses.has(statusFilter)) {
    throw apiBadRequest('Invalid status');
  }

  const query: Record<string, unknown> = {
    status: statusFilter,
    'result.publicResultUrl': { $type: 'string' },
  };
  if (payload.jobId?.trim()) {
    query.jobId = payload.jobId.trim();
  }

  const limit = Math.min(Math.max(payload.limit || 25, 1), 100);

  if (payload.jobId?.trim()) {
    if (!ObjectId.isValid(payload.jobId.trim())) {
      throw apiBadRequest('Invalid jobId');
    }
  }

  const jobs = await db
    .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  const outcome = {
    scanned: jobs.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    skipped: 0,
    errors: [] as Array<{ jobId: string; reason: string }>,
  };

  for (const job of jobs) {
    try {
      const result = await applyCompletionFromJobResult(db, job);
      if (result.action === 'created') outcome.created += 1;
      else if (result.action === 'updated') outcome.updated += 1;
      else outcome.unchanged += 1;
    } catch (error: unknown) {
      outcome.failed += 1;
      outcome.errors.push({
        jobId: job.jobId,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return apiSuccess({
    status: statusFilter,
    outcomes: outcome,
    limit,
    jobId: payload.jobId ?? null,
  });
}
