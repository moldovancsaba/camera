/**
 * The backfill of the screen-sized pictures of existing photos (issue 476, step S7; owner answers 211 b and 219 b), run from the admin so it uses the server's own Blob credentials.
 * Global admins only. It only adds `screenImageUrl` (and its bytes and size) and new files under `screen-pictures/`: no original is touched, nothing is deleted, a photo that has a
 * screen picture is skipped, so it is safe to repeat.
 *
 * GET  /api/admin/screen-pictures/backfill                                   -> { remaining, events }   (counts, writes nothing)
 * POST /api/admin/screen-pictures/backfill   { limit?: number, after?: string, eventId?: string }
 *      -> { processed, counts: { made, 'reused-original', exists, 'no-source', failed }, beforeBytes, afterBytes, next: string | null, remaining }
 *   Makes up to `limit` (default 24, at most 48) pictures, three at a time, walking the photos by id from `after`; the caller repeats with `next` until it is null.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { runScreenBackfillBatch, screenBackfillStatus } from '@/lib/submissions/screen-backfill';

// Three photos at a time, each downloaded, resized and uploaded: 24 take well under a minute.
export const maxDuration = 60;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  const db = await connectToDatabase();
  return apiSuccess(await screenBackfillStatus(db));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown; after?: unknown; eventId?: unknown };
  if (body.after !== undefined && body.after !== null && !(typeof body.after === 'string' && ObjectId.isValid(body.after))) throw apiBadRequest('after is not a photo id');
  if (body.limit !== undefined && !(typeof body.limit === 'number' && Number.isFinite(body.limit))) throw apiBadRequest('limit must be a number');
  if (body.eventId !== undefined && typeof body.eventId !== 'string') throw apiBadRequest('eventId must be text');

  const db = await connectToDatabase();
  return apiSuccess(
    await runScreenBackfillBatch(db, {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      after: typeof body.after === 'string' ? new ObjectId(body.after) : undefined,
      eventId: typeof body.eventId === 'string' ? body.eventId : undefined,
    })
  );
});
