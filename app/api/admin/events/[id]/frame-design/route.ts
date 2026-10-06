/**
 * The generated default frame of an event: the messmass snapshot and the editable message list (camera#234).
 *
 * GET /api/admin/events/[id]/frame-design      the snapshot and the message list (viewer)
 * PUT /api/admin/events/[id]/frame-design      { messages: string[] } or { reset: true } (manager)
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  checkRateLimit,
  RATE_LIMITS,
  requireAuth,
  withErrorHandler,
} from '@/lib/api';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { DEFAULT_FRAME_MESSAGES, MAX_FRAME_MESSAGES, MAX_FRAME_MESSAGE_LENGTH } from '@/lib/frame/messages';
import { saveFrameMessages } from '@/lib/frame/sync';

type RouteContext = { params?: Promise<{ id: string }> };

/** Access first, then the lookup: a caller without access to the event learns nothing about whether it exists. */
async function loadEvent(id: string, session: Session, minRole: 'viewer' | 'manager') {
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, minRole);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  const { event } = await loadEvent(id, session, 'viewer');

  return apiSuccess({
    frameDesign: event.frameDesign ?? null,
    defaultMessages: DEFAULT_FRAME_MESSAGES,
    limits: { maxMessages: MAX_FRAME_MESSAGES, maxLength: MAX_FRAME_MESSAGE_LENGTH },
  });
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'manager');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');
  const frameDesign = await saveFrameMessages(db, event, body as { messages?: unknown; reset?: unknown });
  return apiSuccess({ frameDesign });
});
