/**
 * The general legal part of the e-mails to the user (epic 463, lib/email/legal.ts): the one every partner and event follows until it sets its own.
 *
 * GET /api/admin/emails/legal   { legal } the legal part written at this level, per language (global admin)
 * PUT /api/admin/emails/legal   { legal: { en: "...", hu: "..." } } replaces it; an empty text takes a language away (global admin)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getGlobalLegal, parseLegal, saveGlobalLegal } from '@/lib/email/legal';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return apiSuccess({ legal: await getGlobalLegal(await connectToDatabase()) });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as { legal?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { legal }');
  const parsed = parseLegal(body.legal);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await saveGlobalLegal(await connectToDatabase(), parsed.value, session.user.email ?? null, generateTimestamp());
  return apiSuccess({ legal: parsed.value });
});
