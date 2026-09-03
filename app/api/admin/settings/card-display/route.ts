import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { nowIso } from '@/lib/tryon/time';
import { DEFAULT_CARD_DISPLAY_SETTINGS, getCardDisplaySettings } from '@/lib/admin/card-display-settings';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }
  const db = await connectToDatabase();
  return apiSuccess(await getCardDisplaySettings(db));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of ['metadata', 'status', 'actions'] as const) {
    if (key in rawBody && !isPlainObject(rawBody[key])) {
      throw apiBadRequest(`'${key}' must be an object`);
    }
  }
  const body = rawBody as {
    metadata?: Partial<typeof DEFAULT_CARD_DISPLAY_SETTINGS.metadata>;
    status?: Partial<typeof DEFAULT_CARD_DISPLAY_SETTINGS.status>;
    actions?: Partial<typeof DEFAULT_CARD_DISPLAY_SETTINGS.actions>;
  };

  const db = await connectToDatabase();
  const current = await getCardDisplaySettings(db);
  const now = nowIso();
  const next = {
    settingId: 'card-display' as const,
    metadata: { ...current.metadata, ...body.metadata },
    status: { ...current.status, ...body.status },
    actions: { ...current.actions, ...body.actions },
    updatedAt: now,
    updatedBy: session.user.email,
  };

  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne(
    { settingId: 'card-display' },
    { $set: next },
    { upsert: true }
  );

  return apiSuccess(next);
});
