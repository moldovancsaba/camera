import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getMtkRestorationProgress, MTK_RESTORATION_EVENT_MONGO_ID, restoreNextMtkPhoto } from '@/lib/mtk-photo-restoration';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RESTORE_RATE_LIMIT = { max: 60, windowMs: 60_000, message: 'Please wait before continuing the MTK photo restoration.' };

async function authorize(request: NextRequest, eventMongoId: string) {
  if (eventMongoId !== MTK_RESTORATION_EVENT_MONGO_ID || !ObjectId.isValid(eventMongoId)) throw apiBadRequest('This operation is only available for the authorized MTK event.');
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return session;
}

export const GET = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
  const { id } = await context!.params!;
  await authorize(request, id);
  const status = await getMtkRestorationProgress(await connectToDatabase());
  const response = apiSuccess(status);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});

/** Restore exactly one owner-authorized image per request; the caller may safely retry after a network failure. */
export const POST = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
  const { id } = await context!.params!;
  const session = await authorize(request, id);
  await checkRateLimit(request, RESTORE_RATE_LIMIT);
  const actor = session.user.email?.trim() || session.user.id?.trim() || 'Camera global admin';
  const result = await restoreNextMtkPhoto(await connectToDatabase(), actor);
  const response = apiSuccess(result);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});
