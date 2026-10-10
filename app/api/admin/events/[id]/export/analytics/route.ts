/**
 * Event Analytics Export (issue 521, phase 1)
 *
 * GET /api/admin/events/[id]/export/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=UTC|Europe/Budapest
 * Downloads the figures of the event's Analytics view as one CSV (`section,item,value`): the same numbers the page shows, computed from the same function, with the same days and clock.
 * Read-only. No addresses of users are in it; the people who decided are named (the Vetting tab shows them to the same people), and a name or a user's words that look like a formula are
 * made safe for a spreadsheet.
 *
 * Access: partner-scoped Events manager (or global admin), like the Analytics tab. 403 otherwise, 404 when the event does not exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiNotFound } from '@/lib/api';
import { assertPartnerEventAccess } from '@/lib/partners/authorization';
import { exportSlug } from '@/lib/events/event-export';
import { ObjectId } from 'mongodb';
import { analyticsCsv, analyticsRows } from '@/lib/analytics/export';
import { analyticsEventOf, loadEventAnalytics } from '@/lib/analytics/load';
import { parseAnalyticsQuery } from '@/lib/analytics/query';
import { defaultTimeZone } from '@/lib/analytics/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const session = await requireAuth(request);
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) throw apiNotFound('Event not found');

  const db = await connectToDatabase();
  const doc = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!doc) throw apiNotFound('Event not found');
  await assertPartnerEventAccess(db, session, id, 'manager');

  const event = analyticsEventOf(doc);
  const query = parseAnalyticsQuery(Object.fromEntries(request.nextUrl.searchParams.entries()), defaultTimeZone(event.uiLanguage));
  const { report, sources } = await loadEventAnalytics(db, event, { timeZone: query.timeZone, from: query.from, to: query.to });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(analyticsCsv(analyticsRows(report, sources)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${exportSlug(event.name)}-analytics-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
