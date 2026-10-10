/**
 * The one global switch of the journey defaults (planning item 26, camera#330; lib/admin/defaults-rollout.ts).
 *
 * GET   /api/admin/settings/defaults-rollout   { applyToExistingEvents, updatedAt, updatedBy } (global admin)
 * PATCH /api/admin/settings/defaults-rollout   { applyToExistingEvents: boolean } (global admin)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getDefaultsRollout, type DefaultsRolloutSettings } from '@/lib/admin/defaults-rollout';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return apiSuccess(await getDefaultsRollout(await connectToDatabase()));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);

  const body = (await request.json().catch(() => null)) as { applyToExistingEvents?: unknown } | null;
  if (!body || typeof body.applyToExistingEvents !== 'boolean') throw apiBadRequest('applyToExistingEvents must be true or false');

  const next: DefaultsRolloutSettings = { settingId: 'defaults-rollout', applyToExistingEvents: body.applyToExistingEvents, updatedAt: new Date().toISOString(), updatedBy: session.user.email ?? null };
  await (await connectToDatabase()).collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: 'defaults-rollout' }, { $set: next }, { upsert: true });
  return apiSuccess(next);
});
