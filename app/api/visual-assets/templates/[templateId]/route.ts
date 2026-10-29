/** Rename or delete an experience template. In-use templates cannot be removed. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess, getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';

async function loadOwnedTemplate(db: Awaited<ReturnType<typeof connectToDatabase>>, templateId: string, session: Awaited<ReturnType<typeof requireAuth>>, permission: 'viewer' | 'manager') {
  const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId });
  if (!template) throw apiNotFound('Experience template');
  const level = template.level;
  if (level === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required.');
  } else if (level === 'partner') {
    const access = await assertPartnerMongoWorkspaceAccess(db, session, String(template.ownerId), permission);
    if (!access.partner) throw apiForbidden('Partner access is required.');
  } else if (level === 'event') {
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: String(template.ownerId) });
    if (!event) throw apiNotFound('Template event');
    const access = await getPartnerScopedAccessForEvent(db, String(event._id), session, permission);
    if (!access.allowed) throw apiForbidden('Event access is required.');
  } else {
    throw apiBadRequest('Template owner level is invalid.');
  }
  return template;
}

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ templateId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { templateId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw apiBadRequest('Template name must be 1–120 characters.');
  const db = await connectToDatabase();
  await loadOwnedTemplate(db, templateId, session, 'manager');
  await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).updateOne({ templateId }, { $set: { name: body.name.trim(), updatedAt: generateTimestamp(), updatedBy: session.user.id } });
  return apiSuccess({ template: await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId }) });
});

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ templateId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { templateId } = await context.params;
  const db = await connectToDatabase();
  await loadOwnedTemplate(db, templateId, session, 'manager');
  const [globalDefault, partnerUse, eventUse] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).countDocuments({ settingId: 'default-experience-template', templateId }),
    db.collection(COLLECTIONS.PARTNERS).countDocuments({ defaultExperienceTemplateId: templateId }),
    db.collection(COLLECTIONS.EVENTS).countDocuments({ 'experienceTemplate.templateId': templateId }),
  ]);
  if (globalDefault + partnerUse + eventUse > 0) throw apiError('This template is selected by a parent or event. Change those selections before deleting it.', 409);
  const deleted = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).deleteOne({ templateId });
  if (!deleted.deletedCount) throw apiNotFound('Experience template');
  return apiSuccess({ deleted: templateId });
});
