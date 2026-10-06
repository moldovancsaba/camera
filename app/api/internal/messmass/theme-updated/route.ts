/**
 * POST /api/internal/messmass/theme-updated (camera#285)
 *
 * messmass tells camera that the look of its events changed: a report style was edited or deleted, or a partner's logo, name, style or
 * team data changed. The events are marked stale and the oldest stale ones are refreshed at once (a new snapshot of the messmass theme,
 * and the frame images whose inputs changed); the rest refresh the next time a guest opens them.
 *
 *   { "scope": "all" }                                       every event linked to messmass
 *   { "scope": "events", "messmassEventIds": ["<24 hex>"] }  these events (at most 500)
 *
 * Auth: the messmass shared secret (`x-messmass-secret` or Bearer). Answer: { marked, refreshed, unavailable, failed, remaining }.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { markThemeStale, refreshStaleEvents } from '@/lib/theme/refresh';

// Refreshing an event asks messmass once and may draw up to ten images; no new event is started after 40 s.
export const maxDuration = 60;
const BUDGET_MS = 40_000;
const BATCH = 12;
const MAX_IDS = 500;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const body = (await request.json().catch(() => null)) as { scope?: unknown; messmassEventIds?: unknown } | null;
  let ids: string[] | null;
  if (body?.scope === 'all') {
    ids = null;
  } else if (body?.scope === 'events') {
    const list = body.messmassEventIds;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_IDS || !list.every((id) => typeof id === 'string' && OBJECT_ID.test(id))) {
      throw apiBadRequest(`messmassEventIds must be 1 to ${MAX_IDS} event ids`);
    }
    ids = list as string[];
  } else {
    throw apiBadRequest('scope must be "all" or "events"');
  }

  const db = await connectToDatabase();
  const marked = await markThemeStale(db, ids);
  const run = await refreshStaleEvents(db, { limit: BATCH, budgetMs: BUDGET_MS });
  return apiSuccess({ marked, ...run });
});
