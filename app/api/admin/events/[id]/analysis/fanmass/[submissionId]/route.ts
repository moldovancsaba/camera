import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { confirmFanmassEventPhoto } from '@/lib/fanmass/photo-results';

export const PUT = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string; submissionId: string }> },
) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id, submissionId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(submissionId)) throw apiBadRequest('Invalid event or photo ID.');
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== 'confirm') throw apiBadRequest('The supported action is confirm.');

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  const eventUuid = typeof event.eventId === 'string' ? event.eventId : '';
  if (!eventUuid) throw apiError('The event is missing its Camera event ID.', 409);

  const result = await confirmFanmassEventPhoto(
    db,
    eventUuid,
    event,
    new ObjectId(submissionId),
    session.user.email ?? session.user.id ?? 'event reviewer',
    generateTimestamp(),
  );
  if (!result.item) throw apiNotFound('Eligible event photo');
  if (!result.item.result || result.item.queueStatus !== 'completed') {
    throw apiError('Fanmass has not saved a completed result for this photo yet.', 409);
  }
  return apiSuccess({
    eventId: eventUuid,
    submissionId: result.item.submissionId,
    status: 'confirmed',
    analysisGeneration: result.item.result.analysisGeneration,
    sourceRevision: result.item.result.sourceRevision,
  });
});
