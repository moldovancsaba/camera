/**
 * POST /api/internal/messmass/frame-backfill (camera#285)
 *
 * Draws the generated frame images of the events that have none, with the messmass shared secret (the same work as the admin console's
 * "Give the events a generated frame", for an operator or messmass that holds the secret). Events with a frame of their own are never
 * touched and events that already have images are skipped, so it can be repeated: call again with `batch.nextAfter` until `batch.done`.
 *
 *   { "limit": 1..10 (default 3), "after": "<event id from the previous answer>", "redraw": false }  -> { batch }
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { runBackfillBatch } from '@/lib/frame/backfill';

// A batch draws up to ten events' images; no new event is started after 35 s.
export const maxDuration = 60;
const BUDGET_MS = 35_000;

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown; after?: unknown; redraw?: unknown } | null;
  const limit = body?.limit === undefined ? 3 : body.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10) throw apiBadRequest('limit must be a whole number from 1 to 10');
  if (body?.after !== undefined && body.after !== null && (typeof body.after !== 'string' || body.after.length > 64)) throw apiBadRequest('after must be an event id');

  const db = await connectToDatabase();
  return apiSuccess({ batch: await runBackfillBatch(db, { limit, after: (body?.after as string | null | undefined) ?? null, budgetMs: BUDGET_MS, redraw: body?.redraw === true }) });
});
