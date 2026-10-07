/**
 * The tracked short links of an event (camera#320): one link per placement (the giant screen QR, a poster, an email), each counted on its own and
 * all of them reported to messmass as the event's QR scans and link clicks (lib/short-links/).
 *
 * GET   /api/admin/events/[id]/short-links    the links with their counts, the event's own short URL, and the messmass push state (viewer);
 *   it also pushes the latest totals to messmass, so the numbers there are as fresh as this page
 * POST  /api/admin/events/[id]/short-links    { placement, kind: "qr" | "link", slug? } adds a link (manager)
 * PATCH /api/admin/events/[id]/short-links    { slug, active } switches a link off or on (manager); an off link answers 404, its counts stay
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest, after } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiCreated,
  apiError,
  apiNotFound,
  apiSuccess,
  checkRateLimit,
  RATE_LIMITS,
  requireAuth,
  withErrorHandler,
} from '@/lib/api';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { createShortLink, hitCountsBySlug, listShortLinks, MAX_LINKS_PER_EVENT, MAX_PLACEMENT_LENGTH, setShortLinkActive } from '@/lib/short-links/store';
import { syncLinkStats } from '@/lib/short-links/sync';
import { eventShortUrlView, toLinkView } from '@/lib/short-links/view';

type RouteContext = { params?: Promise<{ id: string }> };

/** Access first, then the lookup: a caller without access to the event learns nothing about whether it exists. */
async function loadEvent(id: string, session: Session, minRole: 'viewer' | 'manager') {
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, minRole);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'viewer');
  const origin = defaultGoShortOrigin();

  const [links, counts] = await Promise.all([listShortLinks(db, id), hitCountsBySlug(db, id)]);
  after(() => syncLinkStats(db, { _id: event._id, messmassEventId: event.messmassEventId as string | undefined }, { force: true }).catch((error: unknown) => console.error(`Event ${id}: messmass was not told`, error)));

  return apiSuccess({
    links: links.map((link) => toLinkView(origin, link, counts)),
    eventShortUrl: eventShortUrlView(origin, event.shortUrlSlug as string | null | undefined, counts),
    linkedToMessmass: Boolean(event.messmassEventId),
    lastPush: (event.shortLinkSync as { pushedAt?: string } | undefined)?.pushedAt ?? null,
    limits: { maxLinks: MAX_LINKS_PER_EVENT, maxPlacementLength: MAX_PLACEMENT_LENGTH },
  });
});

export const POST = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db } = await loadEvent(id, session, 'manager');

  const body = await request.json().catch(() => null);
  const created = await createShortLink(db, id, body);
  if (!created.ok) return apiError(created.error, created.status);
  return apiCreated({ link: toLinkView(defaultGoShortOrigin(), created.link, {}) });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db } = await loadEvent(id, session, 'manager');

  const body = (await request.json().catch(() => null)) as { slug?: unknown; active?: unknown } | null;
  if (!body || typeof body.slug !== 'string' || typeof body.active !== 'boolean') throw apiBadRequest('A slug and active (true or false) are required');
  if (!(await setShortLinkActive(db, id, body.slug.trim().toLowerCase(), body.active))) throw apiNotFound('Link');
  return apiSuccess({ slug: body.slug.trim().toLowerCase(), active: body.active });
});
