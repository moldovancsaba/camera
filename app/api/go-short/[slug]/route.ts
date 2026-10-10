/**
 * Public redirect: short slug → Camera event capture.
 * A tracked link (one per placement, `short_links`, camera#320) and an event's own short URL are counted after the redirect is sent (lib/short-links/visit.ts):
 * people only, not previews or crawlers, and the totals reach messmass (throttled).
 * On GO_SHORT_HOSTNAMES, `proxy.ts` (the Next 16 successor of middleware) rewrites `/{slug}` here (same deployment).
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { defaultCameraOrigin } from '@/lib/site-hosts';
import { resolveTrackedLink } from '@/lib/short-links/store';
import { countVisit } from '@/lib/short-links/visit';
import { checkRateLimit, RATE_LIMITS, withErrorHandler, apiNotFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) => {
  await checkRateLimit(request, RATE_LIMITS.READ);

  const { slug: raw } = await context.params;
  const slug = decodeURIComponent(raw || '').trim().toLowerCase();
  if (!slug) {
    throw apiNotFound('Link');
  }

  const db = await connectToDatabase();

  const tracked = await resolveTrackedLink(db, slug);
  if (tracked) {
    after(() => countVisit(db, { event: tracked.event, slug, kind: tracked.link.kind, method: request.method, headers: request.headers }));
    return NextResponse.redirect(`${defaultCameraOrigin()}/capture/${tracked.event._id.toString()}`, 302);
  }

  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ shortUrlSlug: slug });
  if (event?._id) {
    const dest = `${defaultCameraOrigin()}/capture/${(event._id as ObjectId).toString()}`;
    after(() => countVisit(db, { event: { _id: event._id as ObjectId, messmassEventId: event.messmassEventId as string | undefined }, slug, kind: 'link', method: request.method, headers: request.headers }));
    return NextResponse.redirect(dest, 302);
  }

  // (An event's old Greatest Hits address, a try-on page, redirected here until the try-on integration was removed: issue 557.)
  throw apiNotFound('Link');
});
