/** The optional Camera moderation signal worker: one shared-service photo at a time, never an approval decision. */

import { NextRequest } from 'next/server';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
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
  const db = await connectToDatabase();
  return apiSuccess(await runModerationPrecheckWorker(db));
});

export const GET = handler;
export const POST = handler;
