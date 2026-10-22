/**
 * The Image safety card (issue 509, lib/storage/image-safety.ts), from the admin so it uses the server's own Blob and ImgBB credentials. Global admins only.
 *
 * GET  /api/admin/image-safety                                 -> the count (dry run): where every framed picture is held, where the unframed crops are (our store only, ImgBB only, both), the crops kept in our store because their ImgBB copy could not be verified, the copies not made or not verified, and what a run would do.
 *      **Reads the database only, writes nothing, asks no host.**
 * GET  /api/admin/image-safety?probe=1&after=<id>&limit=<n>     -> one bounded batch of the address check: one-byte range requests to the addresses the photos name; lists the ones that did not answer.
 *      **Reads only, writes nothing, marks nothing** (hiding a gone picture is the Broken pictures card's job). Repeat with `next` until it is null.
 * POST /api/admin/image-safety  { confirm: true, kind: 'rescue' | 'mirror' | 'unframed' | 'unframed-rescue', after?, limit? } -> one bounded batch,
 *      walking photos by id from `after`; repeat with `next` until it is null. Each kind makes or restores a missing copy and verifies it. Source files and addresses are retained; these repair jobs never delete a photo.
 *      It names what it works on by kind and cursor, **never "all"**; a body without `confirm: true` is refused. It adds files and fields (`Submission.imageCopies`). A repeat does only what is still missing;
 *      a copy that fails is reported with its reason.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { logInfo } from '@/lib/observability/logger';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { planImageSafety, probeImageSafety, runImageSafetyBatch, SAFETY_KINDS, type SafetyKind } from '@/lib/storage/image-safety';

export const dynamic = 'force-dynamic';
// A batch downloads, uploads and reads back a few pictures at a time and stops starting new work after 30 seconds.
export const maxDuration = 60;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return session;
}

function cursor(value: unknown): ObjectId | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!(typeof value === 'string' && ObjectId.isValid(value))) throw apiBadRequest('after is not a photo id');
  return new ObjectId(value);
}

function count(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'string' ? Number(value) : value;
  if (!(typeof number === 'number' && Number.isFinite(number))) throw apiBadRequest('limit must be a number');
  return number;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  const params = request.nextUrl.searchParams;
  if (params.get('probe') === '1') {
    await checkRateLimit(request, RATE_LIMITS.ADMIN);
    return apiSuccess(await probeImageSafety(await connectToDatabase(), { after: cursor(params.get('after')), limit: count(params.get('limit')) }));
  }
  return apiSuccess(await planImageSafety(await connectToDatabase()));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { confirm?: unknown; kind?: unknown; after?: unknown; limit?: unknown } | null;
  if (!body || body.confirm !== true) throw apiBadRequest('The run needs { "confirm": true } and the kind of copy. The count is GET.');
  if (typeof body.kind !== 'string' || !SAFETY_KINDS.includes(body.kind as SafetyKind)) throw apiBadRequest(`kind must be one of: ${SAFETY_KINDS.join(', ')}.`);
  const kind = body.kind as SafetyKind;

  const batch = await runImageSafetyBatch(await connectToDatabase(), { kind, after: cursor(body.after), limit: count(body.limit) });
  logInfo('image_safety.run', 'An admin ran a batch of the Image safety card', { by: session.user.id, kind, processed: batch.processed, ...batch.counts, more: batch.next !== null });
  return apiSuccess(batch);
});
