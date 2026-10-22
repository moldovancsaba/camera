import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { confirmFanmassEventPhoto, saveFanmassEventPhotoCorrection } from '@/lib/fanmass/photo-results';

export const PUT = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string; submissionId: string }> },
) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id, submissionId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(submissionId)) throw apiBadRequest('Invalid event or photo ID.');
  const rawBody = await request.text();
  if (rawBody.length > 260_000) throw apiBadRequest('The edited analysis is too large to save.');
  type RequestBody = { action?: unknown; sourceRevision?: unknown; analysisGeneration?: unknown; result?: unknown };
  let body: RequestBody | null = null;
  try {
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    throw apiBadRequest('The request body must be valid JSON.');
  }
  if (!body || (body.action !== 'confirm' && body.action !== 'save_correction')) {
    throw apiBadRequest('The supported actions are confirm and save_correction.');
  }

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  const eventUuid = typeof event.eventId === 'string' ? event.eventId : '';
  if (!eventUuid) throw apiError('The event is missing its Camera event ID.', 409);

  if (body.action === 'save_correction') {
    if (typeof body.sourceRevision !== 'string' || !body.sourceRevision.trim() || typeof body.analysisGeneration !== 'number' || !Number.isInteger(body.analysisGeneration) || body.analysisGeneration < 0 || !body.result || typeof body.result !== 'object' || Array.isArray(body.result)) {
      throw apiBadRequest('A result revision, generation, and edited result are required.');
    }
    const saved = await saveFanmassEventPhotoCorrection(
      db,
      eventUuid,
      event,
      new ObjectId(submissionId),
      session.user.email ?? session.user.id ?? 'event reviewer',
      generateTimestamp(),
      { sourceRevision: body.sourceRevision, analysisGeneration: body.analysisGeneration, result: body.result },
    );
    if (saved.error === 'stale') throw apiError('Fanmass has saved a newer result. Reload the photo and apply your edits to the latest revision.', 409);
    if (saved.error === 'invalid') throw apiBadRequest('The edited result is invalid. Keep summary, analysis, and boxes as objects, include people and faces arrays, and use normalized box coordinates from 0 to 1.');
    if (!saved.item) throw apiNotFound('Eligible event photo');
    return apiSuccess({
      eventId: eventUuid,
      submissionId: saved.item.submissionId,
      status: 'corrected',
      analysisGeneration: body.analysisGeneration,
      sourceRevision: body.sourceRevision,
    });
  }

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
