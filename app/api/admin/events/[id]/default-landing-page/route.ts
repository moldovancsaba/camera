import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { ensureInheritedDefaultLandingPage } from '@/lib/landing-pages/partner-defaults';

type Context = { params: Promise<{ id: string }> };

async function loadEvent(request: NextRequest, context: Context) {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id.');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

/** Set an event-owned landing page as its public default. This detaches a partner copy into an event override. */
export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { db, event } = await loadEvent(request, context);
  const body = await request.json().catch(() => null) as { landingPageId?: unknown } | null;
  const landingPageId = typeof body?.landingPageId === 'string' ? body.landingPageId : '';
  if (!ObjectId.isValid(landingPageId)) throw apiBadRequest('A valid landingPageId is required.');
  const pages = db.collection(COLLECTIONS.LANDING_PAGES);
  const page = await pages.findOne({ _id: new ObjectId(landingPageId), eventMongoId: String(event._id) });
  if (!page) throw apiNotFound('Landing page');
  const now = generateTimestamp();
  await pages.updateOne(
    { _id: page._id },
    { $set: { isDefault: true, updatedAt: now }, $unset: { inheritedFromPartnerId: '', inheritedPartnerRevision: '' } },
  );
  await pages.updateMany({ eventMongoId: String(event._id), _id: { $ne: page._id }, isDefault: true }, { $unset: { isDefault: '' } });
  return apiSuccess({ landingPageId: page.landingPageId, slug: page.slug, isDefault: true, inherited: false });
});

/** Reset to the current partner default; the resulting page keeps a stable event-specific public URL. */
export const POST = withErrorHandler(async (request: NextRequest, context: Context) => {
  const { db, event } = await loadEvent(request, context);
  if (typeof event.partnerId !== 'string' || !event.partnerId) return apiError('This event has no partner default to inherit.', 409);
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }, { projection: { contentDefaults: 1 } });
  const template = partner?.contentDefaults?.landingPage;
  if (!template || template.isActive === false) return apiError('This partner has no active default landing page to inherit.', 409);

  const inherited = await ensureInheritedDefaultLandingPage(db, event, { preferPartnerDefault: true });
  if (!inherited) return apiError('The partner landing page could not be applied. Ensure the event has an active default slideshow.', 503);
  await db.collection(COLLECTIONS.LANDING_PAGES).updateMany(
    { eventMongoId: String(event._id), _id: { $ne: inherited._id }, isDefault: true },
    { $unset: { isDefault: '' } },
  );
  return apiSuccess({ landingPageId: inherited.landingPageId, slug: inherited.slug, isDefault: true, inherited: true });
});
