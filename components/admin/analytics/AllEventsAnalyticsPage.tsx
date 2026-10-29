import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import EventPicker from '@/components/admin/EventPicker';
import AnalyticsView from '@/components/admin/analytics/AnalyticsView';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { loadAllEventsAnalytics, type AllEventsAnalytics } from '@/lib/analytics/load';
import { analyticsHref, parseAnalyticsQuery } from '@/lib/analytics/query';
import { formatCount } from '@/lib/analytics/format';
import AnalyticsLoadError from '@/components/admin/analytics/AnalyticsLoadError';

type SearchParams = Record<string, string | string[] | undefined>;

const FALLBACK_ZONE = 'Europe/Budapest';

/**
 * The Analytics menu of Operations (issue 521): the numbers of every event together and one row per event, for global admins. Picking an event opens that event's own Analytics tab (with
 * its menu and its links), so the numbers of one event live in one place. (The page the menu used to open was the try-on report, removed with the try-on integration, issue 557.)
 */
export default async function AllEventsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseAnalyticsQuery(searchParams, FALLBACK_ZONE);
  let db: Awaited<ReturnType<typeof connectToDatabase>> | null = null;
  let dbError = null;
  try {
    db = await connectToDatabase();
  } catch (error) {
    dbError = serializeMongoError(error);
  }

  if (db && query.eventId) {
    let matchingEvent: { _id: unknown } | null = null;
    try {
      matchingEvent = await db
        .collection(COLLECTIONS.EVENTS)
        .findOne({ $or: [{ eventId: query.eventId }, ...(ObjectId.isValid(query.eventId) ? [{ _id: new ObjectId(query.eventId) }] : [])] }, { projection: { _id: 1 } });
    } catch (error) {
      // A failed optional redirect lookup should not take down the all-events report.
      console.error('Could not resolve the requested analytics event:', error);
    }
    if (matchingEvent) redirect(analyticsHref(`/admin/events/${String(matchingEvent._id)}/analytics`, { ...query, eventId: '' }, {}, FALLBACK_ZONE));
  }

  let analytics: AllEventsAnalytics | null = null;
  let reportError = false;
  try {
    if (db) analytics = await loadAllEventsAnalytics(db, { timeZone: query.timeZone, from: query.from, to: query.to });
  } catch (error) {
    console.error('Error loading the analytics of all events:', error);
    reportError = true;
  }

  const report = analytics?.report;
  return (
    <AdminListPageShell
      eyebrow="Operations"
      title="Analytics"
      description="Photos, vetting, users, screens, e-mails and consents of all events together, from the data that exists today."
      stats={
        report
          ? [
              { label: 'Photos taken', value: formatCount(report.photos.taken), iconKey: 'photo' as const },
              { label: 'Approved', value: formatCount(report.outcomes.approved), iconKey: 'photo' as const },
              { label: 'Waiting', value: formatCount(report.photos.waiting), iconKey: 'photo' as const },
              { label: 'Users', value: formatCount(report.users.distinct), iconKey: 'users' as const },
            ]
          : undefined
      }
      beforeToolbar={<EventPicker basePath="/admin/analytics" />}
      dbError={dbError}
    >
      {reportError ? (
        <AnalyticsLoadError />
      ) : analytics ? (
        <AnalyticsView basePath="/admin/analytics" query={query} defaultTimeZone={FALLBACK_ZONE} report={analytics.report} table={analytics.table} crossEventReturning={analytics.crossEventReturning} />
      ) : null}
    </AdminListPageShell>
  );
}
