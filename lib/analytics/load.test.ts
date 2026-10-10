import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { analyticsEventOf, loadAllEventsAnalytics, loadEventAnalytics, loadPhotoFacts } from './load';

const event = analyticsEventOf({ _id: 'mongo-1', eventId: 'ev-1', name: 'Vasas', shortUrlSlug: 'vasas', uiLanguage: 'hu', messmassEventId: null });
const photo = (id: string, extra: Record<string, unknown> = {}) => ({ _id: id, eventId: 'ev-1', eventIds: ['ev-1'], submissionKind: 'original', createdAt: '2026-10-16T18:00:00.000Z', userId: 'anonymous', userEmail: 'anonymous@event', reviewStatus: 'approved', isArchived: false, ...extra });

function seed() {
  return fakeDb({
    [COLLECTIONS.SUBMISSIONS]: [
      photo('a'),
      photo('b', { eventId: 'ev-2', eventIds: ['ev-2', 'ev-1'] }),
      photo('c', { eventId: 'ev-2', eventIds: ['ev-2'] }),
      photo('t', { submissionKind: 'tryon_result' }),
      photo('old', { submissionKind: undefined }),
    ],
    [COLLECTIONS.EMAIL_REGISTRATIONS]: [
      { eventId: 'ev-1', email: 'k@x.test', createdAt: '2026-10-16T17:00:00.000Z', welcomeSentAt: '2026-10-16T17:00:05.000Z' },
      { eventId: 'mongo-1', email: 'l@x.test', createdAt: '2026-10-16T17:10:00.000Z' },
      { eventId: 'ev-9', email: 'z@x.test', createdAt: '2026-10-16T17:10:00.000Z' },
    ],
    [COLLECTIONS.SLIDESHOWS]: [{ slideshowId: 's1', eventId: 'ev-1', name: 'Main screen' }, { slideshowId: 's9', eventId: 'ev-9', name: 'Other' }],
    [COLLECTIONS.SHORT_LINKS]: [{ slug: 'scr123', eventId: 'mongo-1', placement: 'Giant screen', kind: 'qr', active: true }],
    [COLLECTIONS.SHORT_LINK_HITS]: [
      { slug: 'scr123', eventId: 'mongo-1', day: '2026-10-16', device: 'iphone', kind: 'qr', count: 6 },
      { slug: 'vasas', eventId: 'mongo-1', day: '2026-10-16', device: 'android', kind: 'link', count: 2 },
      { slug: 'other', eventId: 'mongo-9', day: '2026-10-16', device: 'android', kind: 'link', count: 50 },
    ],
    [COLLECTIONS.EVENTS]: [{ _id: 'm1', eventId: 'ev-1', name: 'Vasas' }, { _id: 'm2', eventId: 'ev-2', name: 'Ferencváros' }],
  });
}

test('the photos of an event are the ones filed under it by id or in its list of events, originals only (try-on results have their own report)', async () => {
  const { db } = seed();
  const facts = await loadPhotoFacts(db, event);
  assert.deepEqual(facts.map((f) => f.id).sort(), ['a', 'b', 'old']);
});

test('without an event, every original of every event is read', async () => {
  const { db } = seed();
  assert.deepEqual((await loadPhotoFacts(db, null)).map((f) => f.id).sort(), ['a', 'b', 'c', 'old']);
});

test('there is no cap on the rows: three thousand photos give three thousand counted', async () => {
  const many = Array.from({ length: 3000 }, (_, i) => photo(`p${i}`));
  const { db } = fakeDb({ [COLLECTIONS.SUBMISSIONS]: many });
  const analytics = await loadEventAnalytics(db, event, { timeZone: 'UTC' });
  assert.equal(analytics.report.photos.taken, 3000);
});

test('the report of an event reads its registrations (by either id), its slideshow names and the visits of its links, and nothing of another event', async () => {
  const { db, calls } = seed();
  const analytics = await loadEventAnalytics(db, event, { timeZone: 'Europe/Budapest', now: new Date('2026-10-16T21:00:00.000Z') });
  assert.equal(analytics.report.photos.taken, 3);
  assert.equal(analytics.report.emails.welcome.registrations, 2);
  assert.equal(analytics.report.emails.welcome.sent, 1);
  assert.deepEqual(analytics.sources.rows.map((r) => [r.placement, r.visits]), [['Giant screen', 6], ['Event short address (vasas)', 2]]);
  assert.equal(analytics.sources.totals.visits, 8);
  assert.equal(calls.length, 0, 'read-only: the fake records every write, and there was none');
});

test('all events: the totals and one row per event', async () => {
  const { db } = seed();
  const all = await loadAllEventsAnalytics(db, { timeZone: 'UTC' });
  assert.equal(all.report.photos.taken, 4);
  assert.deepEqual(all.table.map((r) => [r.id, r.name, r.taken]), [['m2', 'Ferencváros', 2], ['m1', 'Vasas', 2]]);
});

test('an event document is read defensively', () => {
  const sparse = analyticsEventOf({ _id: 'x' });
  assert.deepEqual(sparse, { id: 'x', eventId: 'x', name: 'Event', shortUrlSlug: null, uiLanguage: null, messmassEventId: null });
});
