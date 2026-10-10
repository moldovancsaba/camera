/**
 * Reads what the Analytics report needs from the database (issue 521, phase 1) and hands it to the pure functions of lib/analytics. Read-only: nothing here writes. Small functions over
 * `find().toArray()` with a projection, so they run on lib/library/fake-db.ts in the tests (load.test.ts).
 *
 * There is **no row cap**: the old try-on report cut its two main queries at 5,000 rows and said nothing (docs/ANALYTICS_AUDIT.md section 2, defect c). A photo is read with a narrow
 * projection (lib/analytics/facts.ts `PHOTO_PROJECTION`), so a long event is a few megabytes at most.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { PHOTO_PROJECTION, photoFactsOf, type PhotoFacts } from './facts';
import { buildEventReport, buildEventsTable, type EventReport, type EventsTableRow, type RegistrationFact, type ReportOptions } from './report';
import { buildSourcesReport, type SourceHit, type SourceLink, type SourcesReport } from './sources';

export interface AnalyticsEvent {
  /** The Mongo id as a string (`/admin/events/<id>`, the key of the short link rows). */
  id: string;
  /** The UUID the photos are filed under. */
  eventId: string;
  name: string;
  shortUrlSlug: string | null;
  uiLanguage: string | null;
  messmassEventId: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function analyticsEventOf(doc: Record<string, unknown>): AnalyticsEvent {
  return {
    id: String(doc._id),
    eventId: text(doc.eventId) ?? String(doc._id),
    name: text(doc.name) ?? 'Event',
    shortUrlSlug: text(doc.shortUrlSlug),
    uiLanguage: text(doc.uiLanguage),
    messmassEventId: text(doc.messmassEventId),
  };
}

/** The facts of the photos (originals, never try-on results) filed under an event, or of every event when none is given. */
export async function loadPhotoFacts(db: Db, event: Pick<AnalyticsEvent, 'eventId'> | null): Promise<PhotoFacts[]> {
  const filter = event ? { $or: [{ eventId: event.eventId }, { eventIds: { $in: [event.eventId] } }], submissionKind: { $ne: 'tryon_result' } } : { submissionKind: { $ne: 'tryon_result' } };
  const docs = await db.collection(COLLECTIONS.SUBMISSIONS).find(filter, { projection: PHOTO_PROJECTION }).toArray();
  return docs.map((doc) => photoFactsOf(doc)).filter((facts): facts is PhotoFacts => facts !== null);
}

export async function loadRegistrations(db: Db, event: AnalyticsEvent): Promise<RegistrationFact[]> {
  const docs = await db
    .collection(COLLECTIONS.EMAIL_REGISTRATIONS)
    .find({ eventId: { $in: [event.eventId, event.id] } }, { projection: { email: 1, createdAt: 1, welcomeSentAt: 1 } })
    .toArray();
  return docs
    .filter((doc) => typeof doc.email === 'string' && doc.email)
    .map((doc) => ({ email: String(doc.email), createdAt: text(doc.createdAt), welcomeSent: Boolean(text(doc.welcomeSentAt)) }));
}

export async function loadSlideshowNames(db: Db, event: AnalyticsEvent): Promise<Array<{ id: string; name: string }>> {
  const docs = await db.collection(COLLECTIONS.SLIDESHOWS).find({ $or: [{ eventId: event.eventId }, { eventId: event.id }] }, { projection: { slideshowId: 1, name: 1 } }).toArray();
  return docs.filter((doc) => typeof doc.slideshowId === 'string').map((doc) => ({ id: String(doc.slideshowId), name: text(doc.name) ?? 'Slideshow' }));
}

export async function loadSources(db: Db, event: AnalyticsEvent, range: { from?: string | null; to?: string | null }): Promise<SourcesReport> {
  const [linkDocs, hitDocs] = await Promise.all([
    db.collection(COLLECTIONS.SHORT_LINKS).find({ eventId: event.id }).toArray(),
    db.collection(COLLECTIONS.SHORT_LINK_HITS).find({ eventId: event.id }, { projection: { slug: 1, day: 1, device: 1, count: 1 } }).toArray(),
  ]);
  const links: SourceLink[] = linkDocs
    .filter((doc) => typeof doc.slug === 'string')
    .map((doc) => ({ slug: String(doc.slug), placement: text(doc.placement) ?? String(doc.slug), kind: doc.kind === 'link' ? 'link' : 'qr', active: doc.active !== false }));
  const hits: SourceHit[] = hitDocs
    .filter((doc) => typeof doc.slug === 'string' && typeof doc.day === 'string')
    .map((doc) => ({ slug: String(doc.slug), day: String(doc.day), device: doc.device === 'android' || doc.device === 'iphone' ? doc.device : 'other', count: typeof doc.count === 'number' ? doc.count : 0 }));
  return buildSourcesReport(links, hits, event.shortUrlSlug, range);
}

export interface EventAnalytics {
  event: AnalyticsEvent;
  report: EventReport;
  sources: SourcesReport;
}

/** Everything the Analytics view of one event shows. */
export async function loadEventAnalytics(db: Db, event: AnalyticsEvent, options: ReportOptions): Promise<EventAnalytics> {
  const [photos, registrations, slideshows, sources] = await Promise.all([loadPhotoFacts(db, event), loadRegistrations(db, event), loadSlideshowNames(db, event), loadSources(db, event, options)]);
  return { event, report: buildEventReport({ photos, registrations, slideshows }, options), sources };
}

export interface AllEventsAnalytics {
  report: EventReport;
  table: EventsTableRow[];
}

/** The same numbers over every event, and one row per event. */
export async function loadAllEventsAnalytics(db: Db, options: ReportOptions): Promise<AllEventsAnalytics> {
  const [photos, eventDocs, slideshowDocs] = await Promise.all([
    loadPhotoFacts(db, null),
    db.collection(COLLECTIONS.EVENTS).find({}, { projection: { eventId: 1, name: 1 } }).toArray(),
    db.collection(COLLECTIONS.SLIDESHOWS).find({}, { projection: { slideshowId: 1, name: 1 } }).toArray(),
  ]);
  const events = eventDocs.filter((doc) => typeof doc.eventId === 'string').map((doc) => ({ key: String(doc.eventId), id: String(doc._id), name: text(doc.name) ?? String(doc.eventId) }));
  const slideshows = slideshowDocs.filter((doc) => typeof doc.slideshowId === 'string').map((doc) => ({ id: String(doc.slideshowId), name: text(doc.name) ?? 'Slideshow' }));
  return { report: buildEventReport({ photos, slideshows }, options), table: buildEventsTable(photos, events, options) };
}
