/**
 * Rollout of the generated default frame to existing events (camera#238, docs/DEFAULT_FRAME_PLAN.md).
 *
 * POST /api/admin/frame-backfill   (global admin)
 *   { mode: 'dry-run', probe?: boolean }                       -> { report }  writes nothing; `probe` asks messmass once per linked event (read-only)
 *   { mode: 'run', limit?: 1..10 (default 3), after?: string, redraw?: boolean } -> { batch }   snapshot and images for the next events without images;
 *     with `redraw`, the events whose images were drawn with an older drawing code get those images drawn again (nothing else changes)
 *
 * Events with an active frame of their own are never touched and events that already have images are skipped, so a run
 * can be repeated and continued: call again with `batch.nextAfter` until `batch.done`. Failures are listed per event.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, requireAdmin, withErrorHandler } from '@/lib/api';
import { dryRun, runBackfillBatch } from '@/lib/frame/backfill';

// A batch draws up to ten events' images; no new event is started after 35 s.
export const maxDuration = 60;
const BUDGET_MS = 35_000;

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => null)) as { mode?: unknown; probe?: unknown; limit?: unknown; after?: unknown; redraw?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');

  const db = await connectToDatabase();
  if (body.mode === 'dry-run') {
    return apiSuccess({ report: await dryRun(db, { probe: body.probe === true }) });
  }
  if (body.mode === 'run') {
    const limit = body.limit === undefined ? 3 : body.limit;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10) throw apiBadRequest('limit must be a whole number from 1 to 10');
    if (body.after !== undefined && body.after !== null && (typeof body.after !== 'string' || body.after.length > 64)) throw apiBadRequest('after must be an event id');
    return apiSuccess({ batch: await runBackfillBatch(db, { limit, after: (body.after as string | null | undefined) ?? null, budgetMs: BUDGET_MS, redraw: body.redraw === true }) });
  }
  throw apiBadRequest('mode must be "dry-run" or "run"');
});
