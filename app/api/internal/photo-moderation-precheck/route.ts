/** The optional Camera moderation signal worker: one shared-service photo at a time, never an approval decision. */

import { NextRequest } from 'next/server';
import { apiBadRequest, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { runModerationPrecheckWorker } from '@/lib/photo-moderation/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const auth = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (auth !== 'ok') {
    if (auth !== 'not_configured') logSharedSecretRejection('photo moderation precheck worker', 'CRON_SECRET', auth);
    throw apiForbidden();
  }
  const eventMongoId = request.nextUrl.searchParams.get('eventMongoId') || undefined;
  if (process.env.VERCEL_ENV === 'preview') {
    // Preview can use a production DB only for an explicitly scoped test event;
    // an unscoped run could drain unrelated production photos.
    if (!eventMongoId || request.headers.get('x-request-purpose') !== 'test') throw apiForbidden();
  } else if (eventMongoId) {
    throw apiBadRequest('Event-scoped worker runs are Preview-only.');
  }
  if (eventMongoId && !/^[a-f\d]{24}$/i.test(eventMongoId)) throw apiBadRequest('eventMongoId must be a MongoDB ObjectId.');
  const db = await connectToDatabase();
  return apiSuccess(await runModerationPrecheckWorker(db, {
    ...(eventMongoId ? { eventMongoId, maxBatch: 1 } : {}),
  }));
});

export const GET = handler;
export const POST = handler;
