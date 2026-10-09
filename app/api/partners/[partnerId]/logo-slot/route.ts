/**
 * The logo of a partner on the slot model (camera#419, lib/slots/logo-store.ts): the default of its events, which look at it; nothing is copied into them.
 *
 * GET: the logos the partner chose, and the logos the editor can pick (its library and the global logos it can still take). Viewer and above.
 * PUT: `{ value }`, `value` being `{ items? }`: the partner chooses; a global logo it takes is added to its library in the same step. Manager and above.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { loadPartnerLogoPanel, setPartnerLogo } from '@/lib/slots/logo-store';

type Context = { params: Promise<{ partnerId: string }> };

export const GET = withErrorHandler(async (_request: NextRequest, context: Context) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess(await loadPartnerLogoPanel(db, partner));
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  if (!body) throw apiBadRequest('A body with a value is required');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await setPartnerLogo(db, partner, body.value ?? {}, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  return apiSuccess(await loadPartnerLogoPanel(db, saved ?? partner));
});
