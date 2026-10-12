/**
 * The words the vetting person describes a photo with, one level at a time (issue 628, lib/photo-vetting/vocabulary.ts, lib/photo-vetting/vocabulary-level.ts).
 *
 * GET /api/annotation-vocabulary?level=general|partner|event&id=<partner or event Mongo id>
 *     { level, id, name, stored, parent, resolved, groups }: what this level stores, the list as the level above shows it, and the list as this level sees it.
 * PUT /api/annotation-vocabulary?level=...&id=...   body { level, id, options }
 *     replaces what the level stores (an empty list clears it) and answers with the same shape as GET. The query repeats the body so the activity log can say which level was changed;
 *     when it is there it must match the body.
 *
 * Who: general = a global admin; partner = a manager of that partner (the id is its Mongo id or its partner id); event = a global admin or a manager of the event's partner. The level and the id
 * are checked against the stored partner or event, never taken on trust.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { authorizeLevel, loadLevelView, saveLevel } from '@/lib/photo-vetting/vocabulary-level';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.READ);
  const params = request.nextUrl.searchParams;
  const db = await connectToDatabase();
  const target = await authorizeLevel(db, session, params.get('level'), params.get('id'));
  return apiSuccess(await loadLevelView(db, target));
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { level?: unknown; id?: unknown; options?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { level, id, options }');
  const params = request.nextUrl.searchParams;
  if ((params.has('level') && params.get('level') !== body.level) || (params.has('id') && params.get('id') !== (body.id ?? null))) {
    throw apiBadRequest('The level and the id in the address must be the ones in the body');
  }
  const db = await connectToDatabase();
  const target = await authorizeLevel(db, session, body.level, body.id);
  return apiSuccess(await saveLevel(db, session, target, body.options));
});
