import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForPartner } from '@/lib/partners/authorization';
import { mutateParentSlideshowTemplates, normalizeParentSlideshowTemplates } from '@/lib/slideshow/parent-templates';

type Context = { params: Promise<{ partnerId: string }> };

const text = (value: unknown, max = 5000): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length > max) throw apiBadRequest('A content field is too long.');
  return normalized || null;
};
const color = (value: unknown): string | null => {
  const normalized = text(value, 7);
  if (!normalized) return null;
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(normalized)) throw apiBadRequest('Colours must be three- or six-digit hexadecimal values.');
  return normalized;
};

function cleanLandingPage(value: Record<string, unknown>) {
  const fields = [
    'title', 'description', 'logoId', 'logoUrl', 'qrCodeImageUrl', 'url', 'urlButtonText',
    'termsMarkdown', 'termsFileName', 'privacyMarkdown', 'privacyFileName', 'backgroundColor',
    'titleColor', 'descriptionColor', 'qrTitleColor', 'cookiesTitleColor', 'cookiesBodyColor',
    'legalTitleColor', 'legalLinkTextColor', 'buttonColor', 'buttonTextColor',
    'customCssPresetId', 'customCssClassName', 'customCss',
  ] as const;
  const output: Record<string, unknown> = {};
  for (const key of fields) output[key] = text(value[key], key.endsWith('Markdown') || key === 'customCss' ? 100_000 : 40_000);
  for (const key of ['backgroundColor', 'titleColor', 'descriptionColor', 'qrTitleColor', 'cookiesTitleColor', 'cookiesBodyColor', 'legalTitleColor', 'legalLinkTextColor', 'buttonColor', 'buttonTextColor']) {
    output[key] = color(value[key]);
  }
  output.cookieConsentEnabled = value.cookieConsentEnabled === true;
  output.cookieConsentRequired = value.cookieConsentRequired !== false;
  output.isActive = value.isActive !== false;
  return output;
}

async function loadPartner(request: NextRequest, partnerId: string, minRole: 'viewer' | 'manager') {
  if (!ObjectId.isValid(partnerId)) throw apiBadRequest('Invalid partner ID.');
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) throw apiNotFound('Partner');
  const access = await getPartnerScopedAccessForPartner(db, session, String(partner.partnerId), 'events', minRole);
  if (!access.allowed) throw apiNotFound('Partner');
  return { db, partner, session };
}

export const GET = withErrorHandler(async (request, context: Context) => {
  const { partnerId } = await context.params;
  const { db, partner } = await loadPartner(request, partnerId, 'viewer');
  const [globalSetting] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'global-content-defaults' }),
  ]);
  const local = normalizeParentSlideshowTemplates(
    partner.contentDefaults as Record<string, unknown> | null,
    `legacy-partner-slideshow-${partnerId}`,
    false,
  );
  const global = normalizeParentSlideshowTemplates(globalSetting as Record<string, unknown> | null, 'legacy-global-slideshow', true);
  return apiSuccess({
    contentDefaults: { ...(partner.contentDefaults ?? {}), ...local },
    global,
  });
});

export const PATCH = withErrorHandler(async (request, context: Context) => {
  const { partnerId } = await context.params;
  const { db, partner, session } = await loadPartner(request, partnerId, 'manager');
  const parsedBody: unknown = await request.json().catch(() => null);
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) throw apiBadRequest('A content-default operation is required.');
  const body = parsedBody as Parameters<typeof mutateParentSlideshowTemplates>[1] & { kind?: unknown; value?: unknown };
  const kind = body?.kind;
  if (kind === 'slideshowTemplate' || kind === 'slideshow') {
    const state = normalizeParentSlideshowTemplates(
      partner.contentDefaults as Record<string, unknown> | null,
      `legacy-partner-slideshow-${partnerId}`,
      false,
    );
    const next = mutateParentSlideshowTemplates(state, body, false, `legacy-partner-slideshow-${partnerId}`);
    const previousRevision = partner.contentDefaults?.revision;
    const filter = {
      _id: partner._id,
      ...(typeof previousRevision === 'number'
        ? { 'contentDefaults.revision': previousRevision }
        : { 'contentDefaults.revision': { $exists: false } }),
    };
    const saved = await db.collection(COLLECTIONS.PARTNERS).updateOne(filter, {
      $set: {
        // Keep this write scoped to slideshow fields. Replacing the whole
        // contentDefaults object could erase an independent landing-page edit.
        'contentDefaults.slideshowTemplates': next.slideshowTemplates,
        'contentDefaults.defaultSlideshowTemplateId': next.defaultSlideshowTemplateId,
        'contentDefaults.slideshow': next.slideshow,
        'contentDefaults.revision': next.revision,
        updatedAt: generateTimestamp(),
        updatedBy: session.user.id,
      },
    });
    if (saved.matchedCount !== 1) return apiError('These slideshow settings changed elsewhere. Reload and try again.', 409);
    return apiSuccess({ contentDefaults: { ...next, landingPage: partner.contentDefaults?.landingPage ?? null } });
  }
  if (kind !== 'landingPage') throw apiBadRequest('kind must be slideshowTemplate or landingPage.');
  const value = body?.value;
  if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw apiBadRequest('value must be an object or null.');
  const cleanValue = value === null ? null : cleanLandingPage(value as Record<string, unknown>);
  const updatedAt = generateTimestamp();
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { _id: partner._id },
    { $set: { 'contentDefaults.landingPage': cleanValue, updatedAt, updatedBy: session.user.id }, $inc: { 'contentDefaults.revision': 1 } },
  );
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: partner._id }, { projection: { 'contentDefaults.revision': 1 } });
  const revision = Math.max(1, Number(saved?.contentDefaults?.revision) || 1);
  return apiSuccess({ kind, value: cleanValue, revision, updatedAt });
});
