/**
 * The backfill of the default slideshow and the welcome page screen picture for existing events (issue 326, issue 327; owner question 180), from the admin so it uses the server's own Blob
 * credentials. Global admins only. The logic and the rules are in lib/screen/welcome-backfill.ts.
 *
 * GET  /api/admin/welcome-screen-backfill   -> the dry run: { today, rolloutOn, totals, rows } the events that have no picture yet, what a run would do to each and what its users would see
 *   differently. **Reads only, writes nothing.**
 * POST /api/admin/welcome-screen-backfill   { confirm: true, eventIds: string[] } -> { results, remaining, counts }   makes the default slideshow (when the event has none) and the picture
 *   for **the events it is given, never for "all"**: at most 4 events and 40 seconds per call; the caller repeats with `remaining` until it is empty. A body without `confirm: true` or
 *   without ids is refused, so nothing runs by accident. An event that already has the picture is skipped, so a repeat is safe. Nothing is deleted and no page is changed.
 */

import { NextRequest } from 'next/server';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { logInfo } from '@/lib/observability/logger';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { BACKFILL_MAX_IDS, planBackfill, runBackfill } from '@/lib/screen/welcome-backfill';

export const dynamic = 'force-dynamic';
// Each event: a tracked link, the stage picture and the welcome picture are drawn and uploaded; four take well under a minute.
export const maxDuration = 60;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return session;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  return apiSuccess(await planBackfill(await connectToDatabase()));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { confirm?: unknown; eventIds?: unknown } | null;
  if (!body || body.confirm !== true) throw apiBadRequest('The run needs { "confirm": true } and the ids of the events. The dry run is GET.');
  if (!Array.isArray(body.eventIds) || body.eventIds.length === 0 || body.eventIds.some((id) => typeof id !== 'string')) throw apiBadRequest('eventIds must be a list of event ids (at least one).');
  if (body.eventIds.length > BACKFILL_MAX_IDS) throw apiBadRequest(`At most ${BACKFILL_MAX_IDS} events at a time.`);

  const run = await runBackfill(await connectToDatabase(), body.eventIds as string[]);
  logInfo('welcome_screen.backfill', 'An admin ran the welcome page screen backfill', { by: session.user.id, ...run.counts, remaining: run.remaining.length });
  return apiSuccess(run);
});
