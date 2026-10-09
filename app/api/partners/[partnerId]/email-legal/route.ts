/**
 * The legal part of the e-mails of a partner (epic 463, lib/email/legal.ts): what an admin wrote for all events of the partner, above the general legal part.
 *
 * GET /api/partners/<mongo id>/email-legal   { name, legal, inherited } the partner's own legal part per language, and what it takes from above (the general one) (viewer)
 * PUT /api/partners/<mongo id>/email-legal   { legal } replaces the partner's legal part; an empty text takes a language away (manager)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { getGlobalLegal, parseLegal, savePartnerLegal, storedLegal } from '@/lib/email/legal';

type Context = { params: Promise<{ partnerId: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess({ name: String(partner.name ?? ''), legal: storedLegal(partner.emailLegal), inherited: { global: await getGlobalLegal(db) } });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as { legal?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { legal }');
  const parsed = parseLegal(body.legal);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await savePartnerLegal(db, String(partner.partnerId), parsed.value, generateTimestamp());
  return apiSuccess({ legal: parsed.value });
});
