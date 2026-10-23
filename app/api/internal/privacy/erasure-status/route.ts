import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { requireCameraPrivacyResolver } from '@/lib/privacy/internal';
import type { ErasureTargetState } from '@/lib/privacy/erasure';

const MAX_BODY_BYTES = 4_096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^[0-9a-f]{24}$/i;

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Read-only, service-authenticated progress lookup; never returns identity or media references. */
export const POST = withErrorHandler(async (request: NextRequest) => {
  requireCameraPrivacyResolver(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw apiBadRequest('Content-Type must be application/json');
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { throw apiBadRequest('A valid JSON body is required'); }
  if (!isRecord(body) || Object.keys(body).some((key) => !['request_id', 'photo_ids'].includes(key))) throw apiBadRequest('Only request_id and photo_ids are supported');
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  if (!UUID.test(requestId)) throw apiBadRequest('A valid request_id is required');
  if (!Array.isArray(body.photo_ids) || body.photo_ids.length < 1 || body.photo_ids.length > 100) throw apiBadRequest('photo_ids must contain between 1 and 100 values');
  const ids = body.photo_ids.map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '');
  if (ids.some((value) => !PHOTO_ID.test(value)) || new Set(ids).size !== ids.length) throw apiBadRequest('photo_ids must be unique Mongo photo ids');

  const db = await connectToDatabase();
  const rows = await db.collection(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES)
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) }, requestId })
    .project({ _id: 1, status: 1, recordErasedAt: 1, mediaErasedAt: 1, mediaTasks: 1, mediaLastErrorCode: 1, updatedAt: 1 })
    .toArray();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const photos = ids.map((id) => {
    const row = byId.get(id);
    const status = row && typeof row.status === 'string' ? row.status as ErasureTargetState : 'not_found';
    const mediaTasks = Array.isArray(row?.mediaTasks) ? row.mediaTasks : [];
    return {
      photo_id: id,
      status,
      record_erased_at: typeof row?.recordErasedAt === 'string' ? row.recordErasedAt : null,
      media_erased_at: typeof row?.mediaErasedAt === 'string' ? row.mediaErasedAt : null,
      media_error_code: typeof row?.mediaLastErrorCode === 'string' ? row.mediaLastErrorCode : null,
      unresolved_media_tasks: mediaTasks.filter((task) => task && ['unknown', 'failed'].includes(String(task.status))).length,
      pending_media_tasks: mediaTasks.filter((task) => task && ['pending', 'processing', 'retry'].includes(String(task.status))).length,
    };
  });
  return apiSuccess({
    version: 1,
    operation_id: requestId,
    status: photos.every((photo) => photo.status === 'media_erased') ? 'complete' : 'in_progress',
    photos,
  });
});
