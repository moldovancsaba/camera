/**
 * The name of the event or the partner the admin sidebar is showing the menu of (issue 426): inside one event or one partner the menu says which one it is.
 *
 * GET /api/admin/nav-context?kind=event|partner&id=<Mongo _id>   { name } (viewer access to that event or partner; anything else is refused like the pages are)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess, assertPartnerMongoWorkspaceAccess, getPartnerScopedAccessForPartner } from '@/lib/partners/authorization';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.READ);
  const kind = request.nextUrl.searchParams.get('kind');
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if ((kind !== 'event' && kind !== 'partner') || !ObjectId.isValid(id)) throw apiBadRequest('kind must be event or partner and id a valid id');

  const db = await connectToDatabase();
  if (kind === 'partner') {
    const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, id, 'viewer');
    const partnerId = String(partner.partnerId ?? '');
    const eventAccess = partnerId ? await getPartnerScopedAccessForPartner(db, session, partnerId, 'events', 'viewer') : { allowed: false };
    return apiSuccess({
      name: String(partner.name ?? ''),
      eventsHref: eventAccess.allowed ? `/admin/events?partnerId=${encodeURIComponent(partnerId)}` : null,
    });
  }
  const access = await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'viewer');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) }, { projection: { name: 1, partnerId: 1 } });
  if (!event) throw apiNotFound('Event');
  const partnerId = typeof event.partnerId === 'string' ? event.partnerId : access.partnerId;
  const partner = partnerId
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }, { projection: { _id: 1, name: 1, partnerId: 1 } })
    : null;
  const partnerAccess = partnerId && partner
    ? await getPartnerScopedAccessForPartner(db, session, partnerId, undefined, 'viewer')
    : { allowed: false };
  const partnerMongoId = partner?._id?.toString();
  return apiSuccess({
    name: String(event.name ?? ''),
    partnerHref: partnerAccess.allowed && partnerMongoId ? `/admin/partners/${encodeURIComponent(partnerMongoId)}` : null,
  });
});
