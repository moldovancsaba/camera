/**
 * The default slots of a partner's generated frames (docs/FRAME_SLOTS_PLAN.md segment 5, owner answer 220): what its events draw their frame with until they set slots of their own. Following
 * means no copy: an event stores only its own slots; a change here is read by every event that follows, whose images are then redrawn (one event per call, so the admin can show it).
 *
 * GET  /api/partners/<mongo id>/frame-slots   { slots, inherited, messages, sampleEvent, followers } the partner's own default (null: none), the general default it follows, and the sample event the preview uses (viewer)
 * PUT  /api/partners/<mongo id>/frame-slots   { slots } or { reset: true } -> { slots, followers: [{ id, eventId, name }] } the events whose images are to be redrawn (manager)
 * POST /api/partners/<mongo id>/frame-slots   { action: 'preview', slots, messageIndex? } -> { imageDataUrl, width, height, notes, message }   (nothing stored)
 *                                             { action: 'redraw', eventId } -> { total, generated, reused }   (manager; the event must follow this default)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { defaultSlotsView, runDefaultSlotsAction, saveDefaultSlots } from '@/lib/frame/default-slots';

type Context = { params: Promise<{ partnerId: string }> };

// Drawing the images of one event takes a few seconds to half a minute.
export const maxDuration = 60;

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess({ name: String(partner.name ?? ''), ...(await defaultSlotsView(db, { partnerId: String(partner.partnerId) }, partner)) });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as { slots?: unknown; reset?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { slots } or { reset: true }');
  return apiSuccess(await saveDefaultSlots(db, { partnerId: String(partner.partnerId) }, body, session.user?.email ?? null, new Date().toISOString()));
});

export const POST = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { action }');
  return apiSuccess(await runDefaultSlotsAction(db, { partnerId: String(partner.partnerId) }, body));
});
