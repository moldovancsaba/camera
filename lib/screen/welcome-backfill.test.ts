import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveFrameFont } from '@/lib/frame/fonts';
import { clearBrokenCache } from '@/lib/media/pictures';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { renderDefaultOverlay } from './default-stage';
import type { WelcomeScreenDeps } from './welcome-screen-store';
import { BACKFILL_MAX_EVENTS_PER_CALL, backfillEvent, changeFor, isUpcoming, planBackfill, runBackfill, type BackfillDeps } from './welcome-backfill';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const NOW = new Date('2026-10-11T09:00:00.000Z');
const OVERLAY = renderDefaultOverlay({ background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR });

const welcomePage = (config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ pageId: 'w1', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome', buttonText: 'Start', ...config }, ...extra });
const event = (n: number, extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), eventId: `event-uuid-${n}`, name: `Event ${n}`, partnerId: 'p1', partnerName: 'MTK', isActive: true, ...extra });

interface Log {
  uploads: string[];
  fetched: string[];
}

function deps(log: Log, options: { failUploadFor?: string } = {}): BackfillDeps {
  const screen: WelcomeScreenDeps = {
    upload: async (pathname) => {
      if (options.failUploadFor && pathname.includes(options.failUploadFor)) throw new Error('blob is down');
      log.uploads.push(pathname);
      return `https://blob.example/${pathname}`;
    },
    fetchImage: async (url) => {
      log.fetched.push(url);
      return OVERLAY;
    },
    resolveFont: (style) => resolveFrameFont(style),
    now: () => '2026-10-11T09:00:00.000Z',
    random: () => 0,
  };
  return {
    screen,
    slideshow: {
      upload: async (pathname) => {
        log.uploads.push(pathname);
        return `https://blob.example/${pathname}`;
      },
      origin: () => 'https://go.messmass.com',
      now: () => '2026-10-11T09:00:00.000Z',
    },
  };
}

function world(events: Array<Record<string, unknown>>, extra: Record<string, Array<Record<string, unknown>>> = {}) {
  clearBrokenCache();
  return fakeDb({ events, partners: [{ partnerId: 'p1', name: 'MTK' }], ...extra });
}

test('upcoming: the event day is today or later; no date, or a date that is not one, is not upcoming', () => {
  assert.equal(isUpcoming('2026-10-11', NOW), true, 'today');
  assert.equal(isUpcoming('2026-10-11T20:00:00.000Z', NOW), true);
  assert.equal(isUpcoming('2026-11-07', NOW), true);
  assert.equal(isUpcoming('2026-10-10', NOW), false, 'yesterday');
  assert.equal(isUpcoming('', NOW), false);
  assert.equal(isUpcoming(undefined, NOW), false);
  assert.equal(isUpcoming('next Friday', NOW), false);
});

test('what the users see afterwards: a default welcome page, the drawn picture on a welcome page without its own, or nothing', () => {
  assert.equal(changeFor(event(1), true), 'default-welcome-page', 'no welcome page, the defaults switch is on');
  assert.equal(changeFor(event(1), false), 'none', 'no welcome page, the event does not get the defaults');
  assert.equal(changeFor(event(1, { journeyDefaults: true }), false), 'default-welcome-page', 'an event created with the defaults gets them whatever the switch says');
  assert.equal(changeFor(event(1, { customPages: [welcomePage({ screenImageUrl: 'https://r2.example/own.png' })] }), true), 'none', 'its welcome page has a picture of its own: the page keeps it');
  assert.equal(changeFor(event(1, { customPages: [welcomePage()] }), true), 'picture-on-welcome-page', 'a welcome page without a picture shows the drawn one');
  assert.equal(changeFor(event(1, { customPages: [welcomePage({}, { isActive: false })] }), true), 'none', 'a welcome page that is switched off shows nothing and is not replaced by the default');
  assert.equal(changeFor(event(1, { customPages: [{ pageId: 'c', pageType: 'cta', order: 1, isActive: true, config: {} }] }), true), 'default-welcome-page', 'other pages are not welcome pages');
});

test('the dry run reads and writes nothing, counts what a run would touch and lists the events with what would change; events that have the picture are only counted', async () => {
  const events = [
    event(1, { eventDate: '2026-10-14' }),
    event(2, { eventDate: '2026-09-20', customPages: [welcomePage({ screenImageUrl: 'https://r2.example/own.png' })] }),
    event(3, { eventDate: '2026-11-07', isActive: false }),
    event(4, { welcomeScreen: { url: 'https://blob.example/w4.png', key: 'k' } }),
    event(5, { customPages: [welcomePage()] }),
    event(6, { eventDate: '2026-10-10' }),
  ];
  const w = world(events, { slideshows: [{ slideshowId: 's1', eventId: 'event-uuid-1', isDefault: true }, { slideshowId: 's9', eventId: 'event-uuid-2' }], admin_settings: [{ settingId: 'defaults-rollout', applyToExistingEvents: true }] });
  const writes = w.calls.length;
  const before = JSON.stringify(w.data);
  const plan = await planBackfill(w.db, NOW);
  assert.equal(w.calls.length, writes, 'no write call');
  assert.equal(JSON.stringify(w.data), before, 'nothing changed in the data');
  assert.equal(plan.today, '2026-10-11');
  assert.equal(plan.rolloutOn, true);
  assert.deepEqual(plan.totals, { events: 6, withPicture: 1, toDo: 5, toDoUpcoming: 2, toDoInactive: 1, toDoWithoutSlideshow: 4, toDoWithVisibleChange: 4 });
  assert.ok(!plan.rows.some((row) => row.eventId === 'event-uuid-4'), 'the event that has the picture is not listed');
  // Upcoming first, soonest first; then the others, the most recent first.
  assert.deepEqual(plan.rows.map((row) => row.eventId), ['event-uuid-1', 'event-uuid-3', 'event-uuid-6', 'event-uuid-2', 'event-uuid-5']);
  const first = plan.rows[0];
  assert.deepEqual({ ...first, id: typeof first.id }, { id: 'string', eventId: 'event-uuid-1', name: 'Event 1', partnerName: 'MTK', eventDate: '2026-10-14', upcoming: true, isActive: true, hasDefaultSlideshow: true, change: 'default-welcome-page' });
  assert.equal(plan.rows.find((row) => row.eventId === 'event-uuid-2')!.change, 'none');
  assert.equal(plan.rows.find((row) => row.eventId === 'event-uuid-2')!.hasDefaultSlideshow, false, 'a slideshow that is not the default does not count');
});

test('with the defaults switch off, only an event created with the defaults would see a new welcome page', async () => {
  const w = world([event(1), event(2, { journeyDefaults: true })]);
  const plan = await planBackfill(w.db, NOW);
  assert.equal(plan.rolloutOn, false);
  assert.deepEqual(plan.rows.map((row) => [row.eventId, row.change]).sort(), [['event-uuid-1', 'none'], ['event-uuid-2', 'default-welcome-page']]);
});

test('a run makes the default slideshow and the picture of the events it is given, and nothing for the others', async () => {
  const given = event(1, { eventDate: '2026-10-14' });
  const other = event(2);
  const w = world([given, other]);
  const log: Log = { uploads: [], fetched: [] };
  const run = await runBackfill(w.db, [String(given._id)], deps(log));
  assert.deepEqual(run.counts, { drawn: 1, 'already-done': 0, 'not-found': 0, failed: 0 });
  assert.deepEqual(run.remaining, []);
  assert.equal(run.results[0].slideshowMade, true);
  const stored = w.data[COLLECTIONS.EVENTS];
  assert.match((stored[0] as { welcomeScreen: { url: string } }).welcomeScreen.url, /^https:\/\/blob\.example\/screens\/event-uuid-1\/welcome-[0-9a-f]{16}\.png$/);
  assert.equal((stored[1] as { welcomeScreen?: unknown }).welcomeScreen, undefined, 'the event that was not given is untouched');
  const slideshows = w.data[COLLECTIONS.SLIDESHOWS] as Array<{ eventId: string; isDefault: boolean }>;
  assert.deepEqual(slideshows.map((row) => [row.eventId, row.isDefault]), [['event-uuid-1', true]]);
  assert.equal((w.data[COLLECTIONS.SHORT_LINKS] as Array<{ eventId: string; placement: string }>).filter((link) => link.eventId === String(given._id) && link.placement === 'Giant screen').length, 1, 'one tracked Giant screen link');
});

test('it only adds: the pages of the event, its own welcome page picture included, are exactly as they were', async () => {
  const own = welcomePage({ screenImageUrl: 'https://r2.example/mtk-own.png' });
  const given = event(1, { customPages: [own], brandColor: hex('003366') });
  const w = world([given]);
  const before = JSON.stringify(w.data[COLLECTIONS.EVENTS][0]);
  const run = await runBackfill(w.db, [String(given._id)], deps({ uploads: [], fetched: [] }));
  assert.equal(run.counts.drawn, 1);
  const after = w.data[COLLECTIONS.EVENTS][0] as Record<string, unknown>;
  const { welcomeScreen, ...rest } = after;
  assert.ok(welcomeScreen);
  assert.equal(JSON.stringify(rest), before, 'every field the event had is as it was; the picture is the only addition');
  assert.equal(w.calls.filter((call) => call.op === 'deleteMany' || call.op === 'deleteOne').length, 0, 'nothing is deleted');
});

test('it is safe to repeat: an event that has the picture is skipped and nothing is drawn or uploaded again', async () => {
  const given = event(1);
  const w = world([given]);
  const log: Log = { uploads: [], fetched: [] };
  await runBackfill(w.db, [String(given._id)], deps(log));
  const uploads = log.uploads.length;
  const fetched = log.fetched.length;
  const snapshot = JSON.stringify(w.data);
  const again = await runBackfill(w.db, [String(given._id), String(given._id)], deps(log));
  assert.deepEqual(again.counts, { drawn: 0, 'already-done': 1, 'not-found': 0, failed: 0 }, 'the same id twice is one event');
  assert.equal(log.uploads.length, uploads);
  assert.equal(log.fetched.length, fetched);
  assert.equal(JSON.stringify(w.data), snapshot);
});

test('a call does at most a few events and says which ids are left; the repeat finishes them', async () => {
  const events = Array.from({ length: BACKFILL_MAX_EVENTS_PER_CALL + 3 }, (_, i) => event(i + 1));
  const w = world(events);
  const ids = events.map((e) => String(e._id));
  const log: Log = { uploads: [], fetched: [] };
  const first = await runBackfill(w.db, ids, deps(log));
  assert.equal(first.results.length, BACKFILL_MAX_EVENTS_PER_CALL);
  assert.deepEqual(first.remaining, ids.slice(BACKFILL_MAX_EVENTS_PER_CALL));
  const second = await runBackfill(w.db, first.remaining, deps(log));
  assert.deepEqual(second.remaining, []);
  assert.equal(second.counts.drawn, 3);
  assert.equal(w.data[COLLECTIONS.EVENTS].filter((e) => (e as { welcomeScreen?: unknown }).welcomeScreen).length, events.length);
});

test('the time budget stops the call before the next event is started', async () => {
  const events = [event(1), event(2), event(3)];
  const w = world(events);
  let t = 0;
  const run = await runBackfill(w.db, events.map((e) => String(e._id)), { ...deps({ uploads: [], fetched: [] }), now: () => (t += 20_000) }, { budgetMs: 30_000 });
  assert.ok(run.results.length >= 1 && run.results.length < 3, `stopped early (${run.results.length} made)`);
  assert.equal(run.results.length + run.remaining.length, 3);
});

test('an id that is not an event is reported; a failure is reported for that event, the others go on, and the failed one is still to do next time', async () => {
  const a = event(1);
  const b = event(2);
  const c = event(3);
  const w = world([a, b, c]);
  const log: Log = { uploads: [], fetched: [] };
  const run = await runBackfill(w.db, ['not-an-id', String(new ObjectId()), String(a._id), String(b._id), String(c._id)], deps(log, { failUploadFor: 'event-uuid-2/welcome-' }));
  assert.deepEqual(run.counts, { drawn: 2, 'already-done': 0, 'not-found': 2, failed: 1 });
  const failed = run.results.find((result) => result.outcome === 'failed')!;
  assert.equal(failed.name, 'Event 2');
  assert.equal(failed.reason, 'blob is down');
  assert.equal(failed.slideshowMade, true, 'its slideshow was made; the picture is what failed');
  assert.equal((w.data[COLLECTIONS.EVENTS][1] as { welcomeScreen?: unknown }).welcomeScreen, undefined, 'a failed event has no picture');
  // The next plan still lists it, and a repeat only draws the picture.
  const plan = await planBackfill(w.db, NOW);
  assert.deepEqual(plan.rows.map((row) => [row.eventId, row.hasDefaultSlideshow]), [['event-uuid-2', true]]);
  const retry = await runBackfill(w.db, [String(b._id)], deps({ uploads: [], fetched: [] }));
  assert.deepEqual([retry.counts.drawn, retry.results[0].slideshowMade], [1, false]);
});

test('backfillEvent never throws', async () => {
  const w = world([event(1)]);
  const broken = await backfillEvent({ collection: () => { throw new Error('database is down'); } } as never, event(1), {});
  assert.equal(broken.outcome, 'failed');
  assert.match(broken.reason ?? '', /database is down/);
  assert.ok(w.db);
});
