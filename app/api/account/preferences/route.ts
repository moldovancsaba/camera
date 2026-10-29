import { NextRequest } from 'next/server';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getAdminNavigationAccess } from '@/lib/partners/authorization';
import { deviceUiLanguage, parseAcceptLanguage } from '@/lib/i18n/locale-negotiation';
import { DEFAULT_UI_LANGUAGE } from '@/lib/i18n';
import { parseAdminUiLanguagePreferenceBody, readAdminUiLanguagePreference, saveAdminUiLanguagePreference } from '@/lib/account/preferences';

async function authorizeAccountSettings(request: NextRequest) {
  const session = await requireAuth(request);
  const userId = typeof session.user.id === 'string' ? session.user.id.trim() : '';
  if (!userId || session.appAccess === false) throw apiForbidden('Camera admin access required');

  const db = await connectToDatabase();
  const access = await getAdminNavigationAccess(db, session);
  if (!access.isGlobalAdmin && !access.hasAnyPartnerAccess) throw apiForbidden('Camera admin access required');
  return { db, userId };
}

function deviceLanguageFor(request: NextRequest) {
  return deviceUiLanguage(parseAcceptLanguage(request.headers.get('accept-language'))) ?? DEFAULT_UI_LANGUAGE;
}

function privateSettingsResponse(data: { uiLanguage: Awaited<ReturnType<typeof readAdminUiLanguagePreference>>; deviceLanguage: ReturnType<typeof deviceLanguageFor> }) {
  const response = apiSuccess(data);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await checkRateLimit(request, RATE_LIMITS.READ);
  const { db, userId } = await authorizeAccountSettings(request);
  const uiLanguage = await readAdminUiLanguagePreference(db, userId);
  return privateSettingsResponse({ uiLanguage, deviceLanguage: deviceLanguageFor(request) });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  await checkRateLimit(request, RATE_LIMITS.WRITE);
  const { db, userId } = await authorizeAccountSettings(request);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 2_048) throw apiBadRequest('Invalid settings payload');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiBadRequest('A valid JSON settings payload is required');
  }
  const parsed = parseAdminUiLanguagePreferenceBody(body);
  if (!parsed.ok) throw apiBadRequest('uiLanguage must be a supported locale or null to use device language');

  await saveAdminUiLanguagePreference(db, userId, parsed.uiLanguage);
  return privateSettingsResponse({ uiLanguage: parsed.uiLanguage, deviceLanguage: deviceLanguageFor(request) });
});
