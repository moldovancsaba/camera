/**
 * How a user gets the layout and the message of the frame at an event (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md).
 *
 * GET /api/admin/events/[id]/frame-selection   the layouts, the messages, the situation (A, B or C), the saved setting and what the event does until one is saved (viewer)
 * PUT /api/admin/events/[id]/frame-selection   { selection: { layout: { mode, pick? }, message: { mode, pick? } } | null } (manager); null takes the setting away
 *
 * `mode` is `editor` (with a `pick`: a layout id, or the message as listed), `random` or `user`. Nothing changes for an event until an editor saves it.
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { parseFrameSelection } from '@/lib/frame/selection';
import { loadSelectionContext } from '@/lib/frame/selection-options';

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
  const { db, event } = await loadEvent(id, session, 'viewer');
  return apiSuccess(await loadSelectionContext(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'manager');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('selection' in body)) throw apiBadRequest('A JSON body with a selection is required');

  const current = await loadSelectionContext(db, event);
  const parsed = parseFrameSelection((body as { selection: unknown }).selection, {
    layouts: current.layouts.map((layout) => layout.id),
    messages: current.messages.map((message) => message.text),
  });
  if (!parsed.ok) throw apiBadRequest(parsed.error);

  const now = new Date().toISOString();
  await db
    .collection(COLLECTIONS.EVENTS)
    .updateOne({ _id: event._id }, parsed.value ? { $set: { frameSelection: parsed.value, updatedAt: now } } : { $unset: { frameSelection: '' }, $set: { updatedAt: now } });
  return apiSuccess(await loadSelectionContext(db, { ...event, frameSelection: parsed.value ?? undefined }));
});
