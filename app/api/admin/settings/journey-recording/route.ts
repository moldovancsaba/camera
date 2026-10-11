/**
 * The kill switch of the journey recording (issue 521, phase 2; lib/journey/setting.ts).
 *
 * GET   /api/admin/settings/journey-recording   { enabled, updatedAt, updatedBy }  (global admin)
 * PATCH /api/admin/settings/journey-recording   { enabled: boolean }               (global admin)
 *
 * On unless switched off. Off: the guest event answer carries `journeyRecording: false`, so the capture page sends nothing, and the beacon route answers 204 without writing. Takes effect on
 * every server within 30 seconds (the value is kept in memory that long) and at once on the one that handled the switch.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getJourneySetting, setJourneySetting } from '@/lib/journey/setting';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return apiSuccess(await getJourneySetting(await connectToDatabase()));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') throw apiBadRequest('enabled must be true or false');

  return apiSuccess(await setJourneySetting(await connectToDatabase(), body.enabled, session.user.email ?? null));
});
