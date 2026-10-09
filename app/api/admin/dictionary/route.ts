/**
 * The global wordings of the dictionary (issue 353, lib/i18n/overrides.ts): what an admin wrote above the code dictionary, for every partner and event.
 *
 * GET /api/admin/dictionary   { texts } the wordings written at this level (global admin)
 * PUT /api/admin/dictionary   { texts: { en: { key: text }, hu: { ... } } } replaces them; an empty text takes a wording away (global admin)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getGlobalTexts, parseTexts, saveGlobalTexts } from '@/lib/i18n/overrides';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return apiSuccess({ texts: await getGlobalTexts(await connectToDatabase()) });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { texts?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { texts }');
  const parsed = parseTexts(body.texts);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  const db = await connectToDatabase();
  await saveGlobalTexts(db, parsed.value, session.user.email ?? null, generateTimestamp());
  return apiSuccess({ texts: parsed.value });
});
