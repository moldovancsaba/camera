/**
 * The default pictures of a partner (issue 368, lib/events/partner-pictures.ts): the pictures its events show in the picture fields they left empty.
 *
 * GET /api/partners/<mongo id>/pictures   { name, pictures } (viewer)
 * PUT /api/partners/<mongo id>/pictures   { pictures: { welcomeBackground: "https://...", ... } } replaces them; an empty address takes one away (manager)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parsePartnerPictures, storedPartnerPictures } from '@/lib/events/partner-pictures';

type Context = { params: Promise<{ partnerId: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess({ name: String(partner.name ?? ''), pictures: storedPartnerPictures(partner.pictures) });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as { pictures?: unknown } | null;
  if (!body) throw apiBadRequest('The body must be JSON: { pictures }');
  const parsed = parsePartnerPictures(body.pictures);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: String(partner.partnerId) }, { $set: { pictures: parsed.value, updatedAt: generateTimestamp() } });
  return apiSuccess({ pictures: parsed.value });
});
