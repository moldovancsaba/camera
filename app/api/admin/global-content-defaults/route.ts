import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, requireAdmin, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { cleanSlideshowDefault } from '@/lib/slideshow/content-defaults';

/** The one global slideshow fallback inherited by partners, then events. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const db = await connectToDatabase();
  const setting = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'global-content-defaults' });
  return apiSuccess({ revision: Number(setting?.revision) || 0, slideshow: setting?.slideshow ?? null });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = await request.json().catch(() => null) as { kind?: unknown; value?: unknown } | null;
  if (body?.kind !== 'slideshow') throw apiBadRequest('kind must be slideshow.');
  const value = body.value;
  if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw apiBadRequest('value must be an object or null.');
  const slideshow = value === null ? null : cleanSlideshowDefault(value as Record<string, unknown>);
  const updatedAt = generateTimestamp();
  const db = await connectToDatabase();
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne(
    { settingId: 'global-content-defaults' },
    { $set: { settingId: 'global-content-defaults', slideshow, updatedAt, updatedBy: session.user.email ?? null }, $inc: { revision: 1 } },
    { upsert: true },
  );
  const saved = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'global-content-defaults' }, { projection: { revision: 1 } });
  return apiSuccess({ kind: 'slideshow', value: slideshow, revision: Math.max(1, Number(saved?.revision) || 1), updatedAt });
});
