/**
 * The general default slots of the generated frames (docs/FRAME_SLOTS_PLAN.md segment 5, owner answer 220): what every event draws its frame with until its partner, or it, sets slots. Global
 * admins. Same calls as the partner level (/api/partners/<id>/frame-slots).
 *
 * GET  /api/admin/frame-slots   { slots, inherited: null, messages, sampleEvent, followers }
 * PUT  /api/admin/frame-slots   { slots } or { reset: true } -> { slots, followers }
 * POST /api/admin/frame-slots   { action: 'preview', slots, messageIndex? } or { action: 'redraw', eventId }
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { defaultSlotsView, runDefaultSlotsAction, saveDefaultSlots } from '@/lib/frame/default-slots';

export const maxDuration = 60;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return session;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  return apiSuccess(await defaultSlotsView(await connectToDatabase(), 'global'));
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const session = await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { slots?: unknown; reset?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { slots } or { reset: true }');
  return apiSuccess(await saveDefaultSlots(await connectToDatabase(), 'global', body, session.user?.email ?? null, new Date().toISOString()));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { action }');
  return apiSuccess(await runDefaultSlotsAction(await connectToDatabase(), 'global', body));
});
