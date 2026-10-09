/**
 * The wordings of a partner (issue 353, lib/i18n/overrides.ts): what an admin wrote for all events of the partner, above the global wording.
 *
 * GET /api/partners/<mongo id>/texts   { texts, inherited } the partner's own wordings, and what it takes from above (the global wordings) (viewer)
 * PUT /api/partners/<mongo id>/texts   { texts } replaces the partner's wordings; an empty text takes one away (manager)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { getGlobalTexts, parseTexts, savePartnerTexts, storedTexts } from '@/lib/i18n/overrides';

type Context = { params: Promise<{ partnerId: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess({ name: String(partner.name ?? ''), texts: storedTexts(partner.texts), inherited: { global: await getGlobalTexts(db) } });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as { texts?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { texts }');
  const parsed = parseTexts(body.texts);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await savePartnerTexts(db, String(partner.partnerId), parsed.value, generateTimestamp());
  return apiSuccess({ texts: parsed.value });
});
