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

type SearchParams = Record<string, string | string[] | undefined>;

const FALLBACK_ZONE = 'Europe/Budapest';

/**
 * The Analytics menu of Operations (issue 521): the numbers of every event together and one row per event, for global admins. Picking an event opens that event's own Analytics tab (with
 * its menu and its links), so the numbers of one event live in one place. (The page the menu used to open was the try-on report, removed with the try-on integration, issue 557.)
 */
export default async function AllEventsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseAnalyticsQuery(searchParams, FALLBACK_ZONE);
  const db = await connectToDatabase().catch(() => null);

  if (db && query.eventId) {
    const event = await db
      .collection(COLLECTIONS.EVENTS)
      .findOne({ $or: [{ eventId: query.eventId }, ...(ObjectId.isValid(query.eventId) ? [{ _id: new ObjectId(query.eventId) }] : [])] }, { projection: { _id: 1 } });
    if (event) redirect(analyticsHref(`/admin/events/${String(event._id)}/analytics`, { ...query, eventId: '' }, {}, FALLBACK_ZONE));
  }

  let analytics: AllEventsAnalytics | null = null;
  let dbError = null;
  try {
    if (!db) throw new Error('The database is not reachable');
    analytics = await loadAllEventsAnalytics(db, { timeZone: query.timeZone, from: query.from, to: query.to });
  } catch (error) {
    console.error('Error loading the analytics of all events:', error);
    dbError = serializeMongoError(error);
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
              { label: 'Approved', value: formatCount(report.photos.approved), iconKey: 'photo' as const },
              { label: 'Waiting', value: formatCount(report.photos.waiting), iconKey: 'photo' as const },
              { label: 'Users', value: formatCount(report.users.distinct), iconKey: 'users' as const },
            ]
          : undefined
      }
      beforeToolbar={<EventPicker basePath="/admin/analytics" />}
      dbError={dbError}
    >
      {analytics ? <AnalyticsView basePath="/admin/analytics" query={query} defaultTimeZone={FALLBACK_ZONE} report={analytics.report} table={analytics.table} /> : null}
    </AdminListPageShell>
  );
}
