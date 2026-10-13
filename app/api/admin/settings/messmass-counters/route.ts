/**
 * The switch of the counters for messmass (issue 628; lib/analytics/counters-setting.ts), the one place that turns the push on or off.
 *
 * GET   /api/admin/settings/messmass-counters   { settingId, enabled, updatedAt, updatedBy }  (global admin)
 * PATCH /api/admin/settings/messmass-counters   { enabled: boolean }                           (global admin)
 *
 * Off unless a stored `true` (the standard). On: after a vetting decision or a saved marking of the people, camera pushes the counters of the event to messmass (lib/analytics/counters-trigger.ts).
 * Off: nothing is read for messmass and nothing is sent. Takes effect on the next decision. Nothing is pushed by the switch itself.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getCountersSetting, setCountersSetting } from '@/lib/analytics/counters-setting';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return apiSuccess(await getCountersSetting(await connectToDatabase()));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') throw apiBadRequest('enabled must be true or false');

  return apiSuccess(await setCountersSetting(await connectToDatabase(), body.enabled, session.user.email ?? null));
});
