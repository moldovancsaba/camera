/**
 * The check of every photo's picture (lib/media/broken.ts), from the admin: which ones are gone, so that they are hidden everywhere. Global admins. Only the picture's own host is asked
 * (a one-byte range request); only a clear "gone" marks a photo; nothing is deleted.
 *
 * GET  /api/admin/media-health                          -> { unchecked, broken, items: { checked, broken: [{ url, reason, checkedAt, where }] } }   (counts, writes nothing)
 * POST /api/admin/media-health  { after?, limit?, maxAgeDays? }  -> { processed, counts, next, remaining }   (one batch of 40 by default, 80 at most; repeat with `next` until it is null)
 * POST /api/admin/media-health  { kind: 'items', limit? }         -> { processed, broken, cleared, unknown, remaining }   (the other pictures, lib/media/pictures.ts: logos, frames, page pictures, e-mail pictures; repeat until remaining is 0)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { connectToDatabase } from '@/lib/db/mongodb';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { scanBatch, scanFilter } from '@/lib/media/broken';
import { brokenPictureRows, scanPictures } from '@/lib/media/pictures';

export const maxDuration = 60;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  const db = await connectToDatabase();
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const [unchecked, broken, checked, goneItems] = await Promise.all([
    submissions.countDocuments(scanFilter(7, new Date())),
    submissions.countDocuments({ 'mediaHealth.broken': true }),
    db.collection(COLLECTIONS.PICTURE_HEALTH).countDocuments({}),
    brokenPictureRows(db),
  ]);
  return apiSuccess({ unchecked, broken, items: { checked, broken: goneItems } });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; after?: unknown; limit?: unknown; maxAgeDays?: unknown };
  if (body.kind === 'items') {
    if (body.limit !== undefined && !(typeof body.limit === 'number' && Number.isFinite(body.limit))) throw apiBadRequest('limit must be a number');
    return apiSuccess(await scanPictures(await connectToDatabase(), { limit: typeof body.limit === 'number' ? body.limit : undefined }));
  }
  if (body.after !== undefined && body.after !== null && !(typeof body.after === 'string' && ObjectId.isValid(body.after))) throw apiBadRequest('after is not a photo id');
  if (body.limit !== undefined && !(typeof body.limit === 'number' && Number.isFinite(body.limit))) throw apiBadRequest('limit must be a number');
  if (body.maxAgeDays !== undefined && !(typeof body.maxAgeDays === 'number' && Number.isFinite(body.maxAgeDays) && body.maxAgeDays >= 0)) throw apiBadRequest('maxAgeDays must be a number');
  const db = await connectToDatabase();
  return apiSuccess(
    await scanBatch(db, {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      after: typeof body.after === 'string' ? new ObjectId(body.after) : undefined,
      maxAgeDays: typeof body.maxAgeDays === 'number' ? body.maxAgeDays : undefined,
    })
  );
});
