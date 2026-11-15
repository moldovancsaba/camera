import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiForbidden, apiNotFound, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { journeyTemplateForAdmin } from '@/lib/visual-assets/templates';
import { createJourneyTestGrant, JOURNEY_TEST_COOKIE } from '@/lib/visual-assets/journey-test-cookie';

/** Issue a short-lived, event-bound test grant, then enter the real capture journey using a parent-owned journey. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await checkRateLimit(request, RATE_LIMITS.READ);
  const session = await requireAuth(request);
  const eventMongoId = request.nextUrl.searchParams.get('eventId')?.trim() ?? '';
  const templateId = request.nextUrl.searchParams.get('templateId')?.trim() ?? '';
  if (!ObjectId.isValid(eventMongoId) || !/^[A-Za-z0-9_-]{1,100}$/.test(templateId)) throw apiBadRequest('A valid event and journey are required.');

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  if (!event) throw apiNotFound('Event');
  const access = await getPartnerScopedAccessForEvent(db, eventMongoId, session, 'manager');
  if (!isGlobalAdminSession(session) && !access.allowed) throw apiForbidden('Manager access to this event is required to start a journey test.');
  if (event.isActive !== true) throw apiBadRequest('Activate this event before testing its live capture journey.');

  const ownerFilter = [
    { level: 'global', ownerId: null },
    ...(typeof event.partnerId === 'string' && event.partnerId ? [{ level: 'partner', ownerId: event.partnerId }] : []),
  ];
  const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId, $or: ownerFilter });
  if (!template) throw apiNotFound('Journey');
  const safeTemplate = journeyTemplateForAdmin(template as Record<string, unknown>);
  if (!safeTemplate) throw apiBadRequest('This journey has invalid saved page data and cannot be tested.');

  const grant = createJourneyTestGrant(eventMongoId, templateId);
  if (!grant) throw apiBadRequest('Journey testing is unavailable because the server signing key is not configured.');
  const destination = new URL(`/capture/${eventMongoId}`, request.url);
  destination.searchParams.set('journeyTestTemplateId', templateId);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.cookies.set(JOURNEY_TEST_COOKIE, grant, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60,
  });
  return response;
});

/** End the current browser's journey test without changing the event or its published journey. */
export const DELETE = async () => {
  const response = NextResponse.json({ success: true });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.cookies.set(JOURNEY_TEST_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
};
