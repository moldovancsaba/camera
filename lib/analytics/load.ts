/**
 * Reads what the Analytics report needs from the database (issue 521, phase 1) and hands it to the pure functions of lib/analytics. Read-only: nothing here writes. Small functions over
 * `find().toArray()` with a projection, so they run on lib/library/fake-db.ts in the tests (load.test.ts).
 *
 * There is **no row cap**: the old try-on report cut its two main queries at 5,000 rows and said nothing (docs/ANALYTICS_AUDIT.md section 2, defect c). A photo is read with a narrow
 * projection (lib/analytics/facts.ts `PHOTO_PROJECTION`), so a long event is a few megabytes at most.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { PHOTO_PROJECTION, photoFactsOf, type PhotoFacts } from './facts';
import { loadJourneySummary, type JourneySummary } from './journey';
import { buildEventReport, buildEventsTable, type EventReport, type EventsTableRow, type RegistrationFact, type ReportOptions } from './report';
import { buildSourcesReport, type SourceHit, type SourceLink, type SourcesReport } from './sources';
import { dayInRange, localParts } from './time';

export interface AnalyticsEvent {
  /** The Mongo id as a string (`/admin/events/<id>`, the key of the short link rows). */
  id: string;
  /** The UUID the photos are filed under. */
  eventId: string;
  name: string;
  shortUrlSlug: string | null;
  uiLanguage: string | null;
  messmassEventId: string | null;
  /** Where the event's annotation vocabulary comes from (the partner's list and the event's own); left out when the event has none. */
  partnerId?: string;
  annotationVocabulary?: unknown;
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
    ...(text(doc.partnerId) ? { partnerId: text(doc.partnerId) as string } : {}),
    ...(doc.annotationVocabulary ? { annotationVocabulary: doc.annotationVocabulary } : {}),
  };
}

/** The facts of the photos (originals, never try-on results) filed under an event, or of every event when none is given. */
export async function loadPhotoFacts(db: Db, event: Pick<AnalyticsEvent, 'eventId'> | null): Promise<PhotoFacts[]> {
  const eventKeys = event ? [event.eventId] : null;
  const filter = event
    ? { $and: [{ $or: [{ eventId: event.eventId }, { eventIds: { $in: eventKeys! } }, { hiddenFromEvents: { $in: eventKeys! } }] }, { submissionKind: { $ne: 'tryon_result' } }, PRIVACY_ERASURE_ACTIVE_FILTER] }
    : { $and: [{ submissionKind: { $ne: 'tryon_result' } }, PRIVACY_ERASURE_ACTIVE_FILTER] };
  const [docs, tombstones] = await Promise.all([
    db.collection(COLLECTIONS.SUBMISSIONS).find(filter, { projection: PHOTO_PROJECTION }).toArray(),
    db.collection(COLLECTIONS.PHOTO_DELETION_ANALYTICS).find(event ? { eventId: { $in: eventKeys } } : {}, { projection: { eventId: 1, submissionId: 1, createdAt: 1, reviewStatus: 1, identityStatus: 1, method: 1, deviceClass: 1 } }).toArray(),
  ]);
  const facts = docs.map((doc) => photoFactsOf(doc)).filter((fact): fact is PhotoFacts => fact !== null);
  const currentSubmissionIds = new Set(facts.map((fact) => fact.id));
  for (const tombstone of tombstones) {
    if (typeof tombstone.submissionId === 'string' && currentSubmissionIds.has(tombstone.submissionId)) continue;
    const fact = photoFactsOf({
      _id: tombstone._id,
      eventId: tombstone.eventId,
      eventIds: [tombstone.eventId],
      createdAt: tombstone.createdAt,
      reviewStatus: tombstone.reviewStatus,
      userId: tombstone.identityStatus === 'REGISTERED' ? 'registered' : 'anonymous',
      method: tombstone.method,
      isArchived: true,
      analyticsDeletion: 'manual',
      metadata: { identityStatus: tombstone.identityStatus, deviceClass: tombstone.deviceClass },
    });
    if (fact) facts.push(fact);
  }
  return facts;
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

export async function loadSources(db: Db, event: AnalyticsEvent, range: { from?: string | null; to?: string | null }, photos: readonly PhotoFacts[] = []): Promise<SourcesReport> {
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
  const submissions = photos.flatMap((photo) => {
    if (photo.source !== 'user' || photo.excluded || !photo.sourceSlug || !photo.createdAt) return [];
    const date = new Date(photo.createdAt);
    return Number.isNaN(date.getTime()) ? [] : [{ slug: photo.sourceSlug, day: date.toISOString().slice(0, 10) }];
  });
  return buildSourcesReport(links, hits, event.shortUrlSlug, range, submissions);
}

export interface EventAnalytics {
  event: AnalyticsEvent;
  report: EventReport;
  sources: SourcesReport;
  /** The journey recording (issue 521, phase 2; lib/analytics/journey.ts), for the same days read as UTC days. */
  journey: JourneySummary;
}

/** Everything the Analytics view of one event shows, in the words of the event's annotation vocabulary. */
export async function loadEventAnalytics(db: Db, event: AnalyticsEvent, options: ReportOptions): Promise<EventAnalytics> {
  const [photos, registrations, slideshows, journey, vocabulary] = await Promise.all([
    loadPhotoFacts(db, event),
    loadRegistrations(db, event),
    loadSlideshowNames(db, event),
    loadJourneySummary(db, event.eventId, options),
    loadEventVocabulary(db, { partnerId: event.partnerId, annotationVocabulary: event.annotationVocabulary }),
  ]);
  const sources = await loadSources(db, event, options, photos);
  return { event, report: buildEventReport({ photos, registrations, slideshows, vocabulary }, { ...options, eventKey: event.eventId }), sources, journey };
}

export interface AllEventsAnalytics {
  report: EventReport;
  table: EventsTableRow[];
  /** Aggregate-only: identifiable users active in the selected range who have photo records in more than one event at any time. */
  crossEventReturning: { returning: number; identifiable: number; share: number | null };
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
  const eventSets = new Map<string, Set<string>>();
  const activeUsers = new Set<string>();
  const range = new Set(photos.filter((photo) => photo.source === 'user' && !photo.excluded && photo.userKey && (() => {
    if (!options.from && !options.to) return true;
    const day = localParts(photo.createdAt, options.timeZone)?.day;
    return day ? dayInRange(day, options.from, options.to) : false;
  })()).map((photo) => photo.userKey as string));
  for (const photo of photos) {
    if (photo.source !== 'user' || photo.excluded || !photo.userKey) continue;
    const eventsForUser = eventSets.get(photo.userKey) ?? new Set<string>();
    for (const eventKey of photo.eventKeys) if (eventKey) eventsForUser.add(eventKey);
    if (photo.eventKey) eventsForUser.add(photo.eventKey);
    eventSets.set(photo.userKey, eventsForUser);
  }
  for (const userKey of range) activeUsers.add(userKey);
  const returning = [...activeUsers].filter((userKey) => (eventSets.get(userKey)?.size ?? 0) > 1).length;
  return { report: buildEventReport({ photos, slideshows }, options), table: buildEventsTable(photos, events, options), crossEventReturning: { returning, identifiable: activeUsers.size, share: activeUsers.size > 0 ? returning / activeUsers.size : null } };
}
