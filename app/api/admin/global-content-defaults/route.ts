import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiSuccess, checkRateLimit, RATE_LIMITS, requireAdmin, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { mutateParentSlideshowTemplates, normalizeParentSlideshowTemplates } from '@/lib/slideshow/parent-templates';

const SETTING_ID = 'global-content-defaults';
/** Named global slideshow defaults are inherited by partners and then events. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const db = await connectToDatabase();
  const setting = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: SETTING_ID });
  const state = normalizeParentSlideshowTemplates(setting as Record<string, unknown> | null, 'legacy-global-slideshow', true);
  return apiSuccess(state);
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const parsedBody: unknown = await request.json().catch(() => null);
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) throw apiBadRequest('A slideshow-template operation is required.');
  const body = parsedBody as Parameters<typeof mutateParentSlideshowTemplates>[1];
  if (!body || (body.kind !== 'slideshowTemplate' && body.kind !== 'slideshow')) throw apiBadRequest('kind must be slideshowTemplate.');

  const db = await connectToDatabase();
  const collection = db.collection(COLLECTIONS.ADMIN_SETTINGS);
  const setting = await collection.findOne({ settingId: SETTING_ID });
  const state = normalizeParentSlideshowTemplates(setting as Record<string, unknown> | null, 'legacy-global-slideshow', true);
  const next = mutateParentSlideshowTemplates(state, body, true, 'legacy-global-slideshow');
  const filter = setting
    ? { settingId: SETTING_ID, ...(Object.hasOwn(setting, 'revision') ? { revision: setting.revision } : { revision: { $exists: false } }) }
    : { settingId: SETTING_ID };
  const saved = await collection.updateOne(filter, {
    $set: {
      settingId: SETTING_ID,
      slideshowTemplates: next.slideshowTemplates,
      defaultSlideshowTemplateId: next.defaultSlideshowTemplateId,
      slideshow: next.slideshow,
      revision: next.revision,
      updatedAt: generateTimestamp(),
      updatedBy: session.user.email ?? null,
    },
  }, { upsert: !setting });
  if (setting && saved.matchedCount !== 1) return apiError('These slideshow settings changed elsewhere. Reload and try again.', 409);
  return apiSuccess(next);
});
