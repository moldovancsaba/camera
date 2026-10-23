import { NextRequest, NextResponse } from 'next/server';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { buildRestoreReplayReadiness } from '@/lib/privacy/restore-replay-contract';

export const dynamic = 'force-dynamic';

/** Private readiness gate used by the operator replay runner; this route performs no writes. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const readiness = buildRestoreReplayReadiness();
  if (!readiness) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const expected = process.env.CAMERA_PRIVACY_RESTORE_SECRET?.trim();
  const provided = request.headers.get('x-camera-privacy-restore-secret');
  const auth = checkSharedSecret(expected, provided);
  if (auth !== 'ok') {
    if (auth !== 'not_configured') logSharedSecretRejection('privacy restore replay readiness', 'CAMERA_PRIVACY_RESTORE_SECRET', auth);
    throw apiForbidden();
  }
  const response = apiSuccess({ version: 1, ...readiness });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});
