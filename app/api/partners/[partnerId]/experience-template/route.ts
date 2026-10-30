/** Read or change this partner's default experience without opening the rest of partner administration. */
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';

type Context = { params: Promise<{ partnerId: string }> };

async function load(request: NextRequest, context: Context, permission: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  if (!ObjectId.isValid(partnerId)) throw apiBadRequest('Invalid partner id.');
  const db = await connectToDatabase();
  const access = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, permission);
  return { db, partner: access.partner };
}

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { db, partner } = await load(request, context, 'viewer');
  const templates = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES)
    .find({ level: 'partner', ownerId: String(partner.partnerId) })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();
  const value = Object.prototype.hasOwnProperty.call(partner, 'defaultExperienceTemplateId')
    ? partner.defaultExperienceTemplateId
    : 'inherit';
  return apiSuccess({ templateId: value, templates });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: Context) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, partner } = await load(request, context, 'manager');
  const body = await request.json().catch(() => null) as { templateId?: unknown } | null;
  if (!body || !Object.hasOwn(body, 'templateId')) throw apiBadRequest('Send templateId, null to disable the global default, or "inherit" to follow it.');
  const templateId = body.templateId;
  const update: Record<string, unknown> = { updatedAt: generateTimestamp() };
  const unset: Record<string, ''> = {};
  if (templateId === 'inherit') {
    unset.defaultExperienceTemplateId = '';
  } else if (templateId === null) {
    update.defaultExperienceTemplateId = null;
  } else if (typeof templateId === 'string' && templateId.trim().length > 0 && templateId.length <= 100) {
    const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({
      templateId,
      level: 'partner',
      ownerId: String(partner.partnerId),
    });
    if (!template) throw apiBadRequest('Choose a template owned by this partner.');
    update.defaultExperienceTemplateId = templateId;
  } else {
    throw apiBadRequest('templateId must be a partner template, null or "inherit".');
  }
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: String(partner.partnerId) },
    { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: String(partner.partnerId) });
  if (!saved) throw apiNotFound('Partner');
  return apiSuccess({ templateId: Object.prototype.hasOwnProperty.call(saved, 'defaultExperienceTemplateId') ? saved.defaultExperienceTemplateId : 'inherit' });
});
