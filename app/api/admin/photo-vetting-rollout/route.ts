/**
 * Rollout of photo vetting to the events that already exist (camera#271, docs/PHOTO_VETTING_PLAN.md).
 *
 * POST /api/admin/photo-vetting-rollout   (global admin)
 *   { mode: 'dry-run' } -> { report }  writes nothing: how many events would be switched on, and which took photos recently
 *   { mode: 'run' }     -> { result }  turns photo vetting on for every event that does not have it; can be repeated
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, requireAdmin, withErrorHandler } from '@/lib/api';
import { rolloutDryRun, runRollout } from '@/lib/photo-vetting/rollout';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const db = await connectToDatabase();
  if (body?.mode === 'dry-run') {
    return apiSuccess({ report: await rolloutDryRun(db) });
  }
  if (body?.mode === 'run') {
    return apiSuccess({ result: await runRollout(db, session.user.email ?? null) });
  }
  throw apiBadRequest('mode must be "dry-run" or "run"');
});
