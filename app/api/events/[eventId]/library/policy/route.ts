/** Hide or restore an inherited asset in one event's catalog. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { loadEventLibrary, updateEventAssetPolicy } from '@/lib/library/db';

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind || typeof body.id !== 'string' || body.id.length < 1 || body.id.length > 100 || typeof body.hidden !== 'boolean') {
    throw apiBadRequest('Send { kind, id, hidden }.');
  }
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');
  const changed = await updateEventAssetPolicy(db, event, kind, body.id, body.hidden, generateTimestamp());
  if (!changed.ok) throw apiError(changed.reason, changed.status);
  const saved = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  return apiSuccess({ policy: changed.policy, library: await loadEventLibrary(db, saved ?? event, kind) });
});
