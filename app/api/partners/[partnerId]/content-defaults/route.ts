import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getPartnerScopedAccessForPartner } from '@/lib/partners/authorization';
import { parseScreenDesign } from '@/lib/slideshow/screen-design';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';

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

function cleanSlideshow(value: Record<string, unknown>) {
  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(value[key] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw apiBadRequest(`${key} is outside the allowed range.`);
    return Math.round(n);
  };
  const aspect = value.stageAspect == null || value.stageAspect === '' ? null : Number(value.stageAspect);
  if (aspect !== null && (!Number.isFinite(aspect) || aspect < 0.25 || aspect > 4)) throw apiBadRequest('Stage aspect must be between 0.25 and 4.');
  let screenDesign = null;
  if (value.screenDesign) {
    const parsed = parseScreenDesign(value.screenDesign);
    if (!parsed.ok) throw apiBadRequest(parsed.error);
    screenDesign = parsed.value;
  }
  return {
    name: text(value.name, 120) ?? 'Partner default slideshow',
    isActive: value.isActive !== false,
    transitionDurationMs: bounded('transitionDurationMs', 5000, 1000, 600000),
    fadeDurationMs: bounded('fadeDurationMs', 1000, 0, 60000),
    bufferSize: bounded('bufferSize', 10, 1, 50),
    refreshStrategy: value.refreshStrategy === 'batch' ? 'batch' as const : 'continuous' as const,
    playMode: value.playMode === 'once' ? 'once' as const : 'loop' as const,
    orderMode: value.orderMode === 'random' ? 'random' as const : 'fixed' as const,
    crossfade: value.crossfade === true,
    backgroundPrimaryColor: color(value.backgroundPrimaryColor) ?? SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
    backgroundAccentColor: color(value.backgroundAccentColor) ?? SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
    backgroundImageUrl: text(value.backgroundImageUrl, 2048),
    viewportScale: value.viewportScale === 'fill' ? 'fill' as const : 'fit' as const,
    stageAspect: aspect,
    screenDesign,
  };
}

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
  const { partner } = await loadPartner(request, partnerId, 'viewer');
  return apiSuccess({ contentDefaults: partner.contentDefaults ?? { revision: 0, slideshow: null, landingPage: null } });
});

export const PATCH = withErrorHandler(async (request, context: Context) => {
  const { partnerId } = await context.params;
  const { db, partner, session } = await loadPartner(request, partnerId, 'manager');
  const body = await request.json().catch(() => null) as { kind?: unknown; value?: unknown } | null;
  const kind = body?.kind;
  if (kind !== 'slideshow' && kind !== 'landingPage') throw apiBadRequest('kind must be slideshow or landingPage.');
  const value = body?.value;
  if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw apiBadRequest('value must be an object or null.');
  const cleanValue = value === null ? null : kind === 'slideshow' ? cleanSlideshow(value as Record<string, unknown>) : cleanLandingPage(value as Record<string, unknown>);
  const updatedAt = generateTimestamp();
  const field = kind === 'slideshow' ? 'slideshow' : 'landingPage';
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { _id: partner._id },
    { $set: { [`contentDefaults.${field}`]: cleanValue, updatedAt, updatedBy: session.user.id }, $inc: { 'contentDefaults.revision': 1 } },
  );
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: partner._id }, { projection: { 'contentDefaults.revision': 1 } });
  const revision = Math.max(1, Number(saved?.contentDefaults?.revision) || 1);
  return apiSuccess({ kind, value: cleanValue, revision, updatedAt });
});
