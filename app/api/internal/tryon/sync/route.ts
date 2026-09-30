import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { assertInternalTryOnSecret, applyCompletionFromJobResult } from '@/lib/tryon/completion';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import {
  isTryOnJobId,
  isTryOnSyncStatus,
  selectJobsPendingCompletion,
} from '@/lib/tryon/sync';

interface SyncPayload {
  limit: number;
  // undefined when no job id was sent; anything else is validated in syncJobs.
  jobId?: unknown;
  status?: string;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Accepts a number (POST body) or a numeric string (query). Anything else,
// zero or negative falls back to the default; values above the cap are capped.
function parseLimit(rawValue: unknown): number {
  const parsed = typeof rawValue === 'number'
    ? Math.floor(rawValue)
    : Number.parseInt(typeof rawValue === 'string' ? rawValue : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

// An unknown status falls back to 'done' (the cron's own filter), as before.
function parseStatus(rawValue: unknown): string {
  const candidate = typeof rawValue === 'string' ? rawValue.trim() : '';
  return isTryOnSyncStatus(candidate) ? candidate : '';
}

// A blank or absent value means "no job id"; a non-string value is passed
// through so validation rejects it rather than widening to a full sync.
function parseJobId(rawValue: unknown): unknown {
  if (rawValue === undefined || rawValue === null) return undefined;
  if (typeof rawValue !== 'string') return rawValue;
  return rawValue.trim() || undefined;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalTryOnSecret(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> | null;
  const searchParams = request.nextUrl.searchParams;
  const payload: SyncPayload = {
    limit: parseLimit(body?.limit ?? searchParams.get('limit')),
    jobId: parseJobId(body?.jobId) ?? parseJobId(searchParams.get('jobId')),
    status: parseStatus(body?.status) || parseStatus(searchParams.get('status')),
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
    // Constant-time compare with a generic 403 body (CAM-05 / SEC-09); the
    // reason is logged server-side only. CRON_SECRET being unset is the known,
    // owner-pending state (CAM-17), so it is a warning on each cron run rather
    // than an error.
    const cronToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
    const cronCheck = checkSharedSecret(process.env.CRON_SECRET?.trim(), cronToken);
    if (cronCheck !== 'ok') {
      if (cronCheck === 'not_configured') {
        console.warn('[internal-auth] try-on sync cron: CRON_SECRET is not configured; cron-triggered sync stays disabled (fail closed)');
      } else {
        logSharedSecretRejection('try-on sync cron', 'CRON_SECRET', cronCheck);
      }
      throw apiForbidden();
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const payload: SyncPayload = {
    limit: parseLimit(searchParams.get('limit')),
    jobId: parseJobId(searchParams.get('jobId')),
    status: parseStatus(searchParams.get('status')),
  };

  return syncJobs(payload);
});

async function syncJobs(payload: SyncPayload) {
  const statusFilter = payload.status || 'done';
  if (!isTryOnSyncStatus(statusFilter)) {
    throw apiBadRequest('Invalid status');
  }

  // WHAT: A job id must look like one createTryOnJobId mints
  //     (job_<yyyyMMddHHmmss>_<8 hex>). WHY (CAM-09): this used to demand a
  //     Mongo ObjectId, which a job id never is, so every ?jobId= call was a 400.
  let jobId: string | undefined;
  if (payload.jobId !== undefined) {
    if (!isTryOnJobId(payload.jobId)) {
      throw apiBadRequest('Invalid jobId: expected job_<yyyyMMddHHmmss>_<8 hex chars>');
    }
    jobId = payload.jobId;
  }

  const limit = payload.limit;
  const db = await connectToDatabase();

  // WHAT: Only jobs with no completion marker yet (lib/tryon/sync.ts).
  // WHY (CAM-02): re-applying an applied job re-uploads and re-frames its
  //     result on every run; a run with nothing new must not write anything.
  //     Already-applied jobs are counted in `skipped`, including a ?jobId= that
  //     was applied before (re-apply one with the admin reapply-result route).
  const { jobs, alreadyApplied } = await selectJobsPendingCompletion(db, {
    status: statusFilter,
    jobId,
    limit,
  });

  const outcome = {
    scanned: jobs.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    skipped: alreadyApplied,
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
    jobId: jobId ?? null,
  });
}
