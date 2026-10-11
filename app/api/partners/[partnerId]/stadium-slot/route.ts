/**
 * The stadium backgrounds of a partner (issue 326, lib/slots/stadium-store.ts): the default of its events, which look at it; nothing is copied into them. A partner with nothing stored follows the
 * global stadium backgrounds.
 *
 * GET: what the partner uses, what it chose itself, the global default and what it can pick (the global ones and its own uploads). Viewer and above.
 * PUT: `{ value }`, `value` being `{ items?, useDefault? }`: use the default (nothing), add more, replace, or none. Manager and above.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { loadPartnerStadiumPanel, setPartnerStadium } from '@/lib/slots/stadium-store';

type Context = { params: Promise<{ partnerId: string }> };

export const GET = withErrorHandler(async (_request: NextRequest, context: Context) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess(await loadPartnerStadiumPanel(db, partner));
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  if (!body) throw apiBadRequest('A body with a value is required');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await setPartnerStadium(db, partner, body.value ?? {}, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  return apiSuccess(await loadPartnerStadiumPanel(db, saved ?? partner));
});
