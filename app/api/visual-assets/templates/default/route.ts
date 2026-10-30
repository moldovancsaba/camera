/** Select or clear the service-wide starter experience. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, requireAdmin, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  const [setting, templates] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'default-experience-template' }),
    db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).find({ level: 'global', ownerId: null }).sort({ updatedAt: -1 }).limit(200).toArray(),
  ]);
  return apiSuccess({ templateId: typeof setting?.templateId === 'string' ? setting.templateId : null, templates });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { templateId?: unknown } | null;
  if (!body || (body.templateId !== null && (typeof body.templateId !== 'string' || !body.templateId.trim()))) throw apiBadRequest('Send a global templateId or null to disable the service default.');
  const db = await connectToDatabase();
  if (typeof body.templateId === 'string') {
    const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: body.templateId, level: 'global', ownerId: null });
    if (!template) throw apiNotFound('Global experience template');
  }
  const now = generateTimestamp();
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne(
    { settingId: 'default-experience-template' },
    { $set: { settingId: 'default-experience-template', templateId: body.templateId, updatedAt: now, updatedBy: session.user.email ?? null } },
    { upsert: true },
  );
  return apiSuccess({ templateId: body.templateId });
});
