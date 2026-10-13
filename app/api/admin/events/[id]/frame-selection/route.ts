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
import { allowedImage } from '@/lib/theme/event-theme';

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
  return apiSuccess({ ...await loadSelectionContext(db, event), tiles: event.frameSelectionTiles ?? {} });
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

  const allowedIds = new Set(current.layouts.map((layout) => layout.id));
  const hasTileInput = Object.hasOwn(body, 'tiles');
  const rawTiles = hasTileInput ? (body as { tiles?: unknown }).tiles : (event.frameSelectionTiles ?? {});
  if (!rawTiles || typeof rawTiles !== 'object' || Array.isArray(rawTiles)) throw apiBadRequest('tiles must be an object');
  const tiles: Record<string, { imageUrl?: string; color?: string }> = {};
  for (const [id, raw] of Object.entries(rawTiles as Record<string, unknown>)) {
    // Removed layouts can leave old tile settings behind. Ignore them when saving
    // the complete admin form, while still rejecting malformed tile values.
    if (hasTileInput && !allowedIds.has(id)) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw apiBadRequest('A tile has an invalid shape');
    const value = raw as { imageUrl?: unknown; color?: unknown };
    const imageUrl = typeof value.imageUrl === 'string' && value.imageUrl.trim() ? allowedImage(value.imageUrl.trim()) : null;
    if (typeof value.imageUrl === 'string' && value.imageUrl.trim() && !imageUrl) throw apiBadRequest('A tile picture must be stored in the camera image library');
    const color = typeof value.color === 'string' && value.color.trim() ? value.color.trim() : null;
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw apiBadRequest('A tile colour must be a six digit hex colour');
    if (imageUrl || color) tiles[id] = { ...(imageUrl ? { imageUrl } : {}), ...(color ? { color: color.toUpperCase() } : {}) };
  }

  const now = new Date().toISOString();
  const set: Record<string, unknown> = { updatedAt: now };
  const unset: Record<string, ''> = {};
  if (parsed.value) set.frameSelection = parsed.value;
  else unset.frameSelection = '';
  if (Object.keys(tiles).length) set.frameSelectionTiles = tiles;
  else unset.frameSelectionTiles = '';
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  });
  return apiSuccess({ ...await loadSelectionContext(db, { ...event, frameSelection: parsed.value ?? undefined }), tiles });
});
