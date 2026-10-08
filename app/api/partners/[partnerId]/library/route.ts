/**
 * Partner library API (camera#361, docs/LIBRARIES.md)
 *
 * GET:  the partner's library of one kind (`?kind=frames`): its items with their pictures, and the global items it can still add.
 * PUT:  edit it: `{ kind, add?, remove?, defaults? }`. A partner takes items of the global library only. Partner managers and global admins.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { updateChildEventsFromPartner } from '@/lib/db/events';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { loadPartnerLibrary, savePartnerLibrary } from '@/lib/library/db';

const MAX_IDS = 200;

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames or logos');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess(await loadPartnerLibrary(db, partner, kind));
});

function ids(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_IDS || value.some((v) => typeof v !== 'string' || !v || v.length > 80)) {
    throw apiBadRequest(`${field} must be a list of ids (at most ${MAX_IDS})`);
  }
  return value as string[];
}

export const PUT = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind) throw apiBadRequest('kind must be frames or logos');
  const change = { add: ids(body.add, 'add'), remove: ids(body.remove, 'remove'), defaults: ids(body.defaults, 'defaults') };
  if (!change.add?.length && !change.remove?.length && !change.defaults) throw apiBadRequest('Nothing to change: send add, remove or defaults');

  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await savePartnerLibrary(db, partner, kind, change, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);

  // The defaults follow into the events that have not edited their own list (the same cascade as on the partner page).
  const cascade = result.defaultsChanged ? await updateChildEventsFromPartner(String(partner.partnerId), { defaultFrames: result.defaults }) : null;

  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  return apiSuccess({ library: await loadPartnerLibrary(db, saved ?? partner, kind), removedInUse: result.removedInUse, cascade });
});
