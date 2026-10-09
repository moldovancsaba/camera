/**
 * Somebody registers at an event (epic 463, lib/email/triggers.ts, segment E8): the capture page calls this when the user has given a name and an e-mail on the "Who are you" step, or signed in,
 * before the photo, and only when the event has the welcome e-mail switched on. The welcome e-mail is sent once for each event and address.
 *
 * POST /api/events/<id, uuid or URL slug>/register   { name, email } -> { registered: true }; 400 for an address that is not an e-mail address
 *
 * Public (the user is not signed in), rate limited. The answer never says whether an e-mail went, so it cannot be used to find out who is registered.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { registerVisitor } from '@/lib/email/triggers';

type Context = { params: Promise<{ eventId: string }> };

export const POST = withErrorHandler(async (request: NextRequest, context: Context) => {
  await checkRateLimit(request, RATE_LIMITS.WRITE);
  const { eventId } = await context.params;
  const key = eventId?.trim();
  if (!key) throw apiBadRequest('Event identifier is required');
  const body = (await request.json().catch(() => null)) as { name?: unknown; email?: unknown } | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { name, email }');

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({
    $or: [...(ObjectId.isValid(key) ? [{ _id: new ObjectId(key) }] : []), { eventId: key }, { shortUrlSlug: key }],
  });
  if (!event || event.isActive === false) throw apiNotFound('Event');

  if (!(await registerVisitor(db, event, body))) throw apiBadRequest('A valid e-mail address is required');
  return apiSuccess({ registered: true });
});
