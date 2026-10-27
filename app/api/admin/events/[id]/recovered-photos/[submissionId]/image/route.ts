/**
 * Serve a recovered, consent-expired photo to an authorized event manager for restricted review.
 * This route deliberately does not revive the submission's normal image URL or consent state.
 */

import { get } from '@vercel/blob';
import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, apiBadRequest, apiNotFound, apiError } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { logWarn } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string; submissionId: string }> }
) => {
  const session = await requireAuth(request);
  const { id: eventMongoId, submissionId } = await context!.params!;
  if (!ObjectId.isValid(eventMongoId) || !ObjectId.isValid(submissionId)) throw apiBadRequest('Invalid event or submission id');

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) }, { projection: { eventId: 1 } });
  if (!event || typeof event.eventId !== 'string') throw apiNotFound('Event not found');

  const submission = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
    $and: [
      { _id: new ObjectId(submissionId), $or: [{ eventId: event.eventId }, { eventIds: { $in: [event.eventId] } }] },
      { consentStatus: 'expired', retentionStatus: 'erased', 'adminRecovery.state': 'available', 'adminRecovery.store': 'camera-mtk-recovery' },
      PRIVACY_ERASURE_ACTIVE_FILTER,
    ],
  }, { projection: { adminRecovery: 1 } });
  const recovery = submission?.adminRecovery as { pathname?: unknown } | undefined;
  const expectedPathname = `camera-admin-recovery/mtk/${submissionId}.jpg`;
  if (!recovery || recovery.pathname !== expectedPathname) throw apiNotFound('Recovered photo not found');

  const storeId = process.env.CAMERA_MTK_RECOVERY_STORE_ID?.trim();
  // Vercel injects the runtime OIDC token into each Function request header; it
  // is a build/local environment variable, not a runtime process.env value.
  const oidcToken = request.headers.get('x-vercel-oidc-token')?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!storeId || !oidcToken) throw apiError('Restricted recovery storage is not configured', 503);

  const blob = await get(expectedPathname, { access: 'private', storeId, oidcToken, useCache: false }).catch(() => {
    logWarn('admin_recovery.image_read_failed', 'A restricted recovery photo could not be read from private storage', { submissionId });
    throw apiError('Recovered photo is temporarily unavailable', 503);
  });
  if (!blob || blob.statusCode !== 200) throw apiNotFound('Recovered photo not found');
  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline; filename="recovered-photo.jpg"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
