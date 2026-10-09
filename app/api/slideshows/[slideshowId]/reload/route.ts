/**
 * Admin: ask every open copy of a giant-screen slideshow to reload (camera#476, step S8b).
 *
 * POST: stores the time of the request on the slideshow (`reloadRequestedAt`). Every playlist answer carries it as `reloadToken`; a full-screen player that sees a
 * token different from the one it opened with reloads at its next slide (lib/slideshow/reload.ts). Needs the Events manager role of the event's partner (or a global admin).
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ slideshowId: string }> }) => {
    const session = await requireAuth(request);
    const { slideshowId } = await context.params;
    if (!slideshowId?.trim()) throw apiBadRequest('slideshowId is required');

    const db = await connectToDatabase();
    const slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({ slideshowId: slideshowId.trim() });
    if (!slideshow) throw apiNotFound('Slideshow not found');

    const eventUuid = typeof slideshow.eventId === 'string' ? slideshow.eventId : '';
    const event = eventUuid ? await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: eventUuid }) : null;
    if (!event?._id) throw apiNotFound('Event not found');
    await assertGlobalAdminOrPartnerEventAccess(db, session, event._id.toString(), 'manager');

    const reloadRequestedAt = generateTimestamp();
    await db.collection(COLLECTIONS.SLIDESHOWS).updateOne({ slideshowId: slideshow.slideshowId }, { $set: { reloadRequestedAt, updatedAt: reloadRequestedAt } });
    return apiSuccess({ reloadRequestedAt });
  }
);
