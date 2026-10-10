import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import AnalyticsView from '@/components/admin/analytics/AnalyticsView';
import MessmassSection from '@/components/admin/analytics/MessmassSection';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { analyticsEventOf, loadEventAnalytics, type EventAnalytics } from '@/lib/analytics/load';
import { loadCounterState, type CounterState } from '@/lib/analytics/counters-sync';
import { parseAnalyticsQuery } from '@/lib/analytics/query';
import { defaultTimeZone } from '@/lib/analytics/time';
import { formatCount } from '@/lib/analytics/format';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

// WHAT: The event's Analytics tab (issue 521, phase 1; docs/ANALYTICS_AUDIT.md): the numbers of the event computed from the data that already exists (photos, vetting, users, people
// marked, screens, links, e-mails, consents), for the event's managers and global admins like the Vetting tab next to it. WHY: the tab used to be the try-on moderation report and nothing
// else; that report went with the try-on integration (issue 557, docs/TRYON_REMOVED.md), and a stored `?view=tryon` link shows the overview.
export default async function EventAnalyticsTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const sp: SearchParams = searchParams ? await searchParams : {};

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const globalAdmin = isGlobalAdminSession(session);

  const eventDoc = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!eventDoc) notFound();
  const event = analyticsEventOf(eventDoc);
  const fallbackZone = defaultTimeZone(event.uiLanguage);
  const query = parseAnalyticsQuery(sp, fallbackZone);

  let analytics: EventAnalytics | null = null;
  let counterState: CounterState | null = null;
  let dbError = null;
  try {
    analytics = await loadEventAnalytics(db, event, { timeZone: query.timeZone, from: query.from, to: query.to });
    // The Messmass tab (global admins) previews what would be sent; it reads the whole event, whatever days are chosen, and sends nothing.
    if (query.view === 'messmass' && globalAdmin) counterState = await loadCounterState(db, { eventId: event.eventId, messmassEventId: event.messmassEventId, counterSync: (eventDoc as { counterSync?: { pushedAt?: unknown; counters?: unknown } }).counterSync });
  } catch (error) {
    console.error('Error loading the event analytics:', error);
    dbError = serializeMongoError(error);
  }

  const report = analytics?.report;
  return (
    <AdminListPageShell
      eyebrow={event.name}
      title="Analytics"
      description="Photos, vetting, users, screens, links, e-mails and consents of this event, from the data that exists today."
      stats={
        report
          ? [
              { label: 'Photos taken', value: formatCount(report.photos.taken), iconKey: 'photo' as const },
              { label: 'Approved', value: formatCount(report.photos.approved), iconKey: 'photo' as const },
              { label: 'Waiting', value: formatCount(report.photos.waiting), iconKey: 'photo' as const },
              { label: 'Users', value: formatCount(report.users.distinct), iconKey: 'users' as const },
            ]
          : undefined
      }
      dbError={dbError}
    >
      {analytics ? (
        <AnalyticsView
          basePath={`/admin/events/${id}/analytics`}
          query={query}
          defaultTimeZone={fallbackZone}
          report={analytics.report}
          sources={analytics.sources}
          eventMongoId={id}
          exportHref={`/api/admin/events/${id}/export/analytics?${new URLSearchParams({ tz: query.timeZone, ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) }).toString()}`}
          showMessmass={globalAdmin}
          messmass={counterState ? <MessmassSection state={counterState} timeZone={query.timeZone} /> : undefined}
        />
      ) : null}
    </AdminListPageShell>
  );
}
