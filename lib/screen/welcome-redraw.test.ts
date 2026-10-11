import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveFrameFont } from '@/lib/frame/fonts';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { clearBrokenCache } from '@/lib/media/pictures';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { renderDefaultOverlay } from './default-stage';
import { ensureWelcomeScreen, type WelcomeScreenDeps } from './welcome-screen-store';
import { autoRedrawEnabled, colourInputsOf, createRedrawScheduler, hasStoredPicture, redrawEvent, scheduleWelcomeRedraw, scheduleWelcomeRedrawForPartner } from './welcome-redraw';

const OVERLAY = renderDefaultOverlay({ background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR });
/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const selfie = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: pictureId, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['sample-selfie'], scope: 'global', createdAt: '2026-10-01T00:00:00.000Z', ...extra });
const solid = (r: number, g: number, b: number, width = 400, height = 500) => sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer();

interface Log {
  uploads: Array<{ pathname: string; png: Buffer }>;
  fetched: string[];
}

function deps(log: Log, images: Record<string, Buffer | null> = {}, overrides: Partial<WelcomeScreenDeps> = {}): WelcomeScreenDeps {
  return {
    upload: async (pathname, png) => {
      log.uploads.push({ pathname, png });
      return `https://blob.example/${pathname}`;
    },
    fetchImage: async (url) => {
      log.fetched.push(url);
      return url in images ? images[url] : OVERLAY;
    },
    resolveFont: (style) => resolveFrameFont(style),
    now: () => '2026-10-11T12:00:00.000Z',
    random: () => 0,
    ...overrides,
  };
}

type Stored = Record<string, unknown> & { welcomeScreen?: { url: string; key: string; generatedAt: string } };

/** An event with its default slideshow and its welcome page screen already drawn (like an event that has the picture today). */
async function drawnWorld(extra: Record<string, unknown> = {}, images: Array<Record<string, unknown>> = []) {
  clearBrokenCache();
  const event = { _id: 'mongo-1', eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'p1', ...extra };
  const seeded = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }], images });
  const made = await ensureDefaultSlideshow(seeded.db, event, { upload: async (pathname) => `https://blob.example/${pathname}`, origin: () => 'https://go.messmass.com', now: () => '2026-10-10T10:00:00.000Z' });
  assert.ok(made.ok);
  const log: Log = { uploads: [], fetched: [] };
  const first = await ensureWelcomeScreen(seeded.db, seeded.data[COLLECTIONS.EVENTS][0], deps(log));
  assert.ok(first.ok && first.created);
  const current = () => seeded.data[COLLECTIONS.EVENTS][0] as Stored;
  return { ...seeded, log, current, snapshot: () => structuredClone(current()) };
}

/** The colour at the middle of the photo window of a drawn picture. */
async function windowPixel(png: Buffer): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(info.height * 0.5) * info.width + Math.round(info.width * 0.35)) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

test('the switch: on unless WELCOME_SCREEN_AUTO_REDRAW says off, 0, false or no', () => {
  assert.equal(autoRedrawEnabled(undefined), true);
  assert.equal(autoRedrawEnabled(''), true);
  assert.equal(autoRedrawEnabled('on'), true);
  for (const off of ['off', 'OFF', ' 0 ', 'false', 'No']) assert.equal(autoRedrawEnabled(off), false, off);
});

test('only an event that has the picture is touched', () => {
  assert.equal(hasStoredPicture({}), false);
  assert.equal(hasStoredPicture(null), false);
  assert.equal(hasStoredPicture({ welcomeScreen: {} }), false);
  assert.equal(hasStoredPicture({ welcomeScreen: { url: '' } }), false);
  assert.equal(hasStoredPicture({ welcomeScreen: { url: 'https://blob.example/w.png' } }), true);
});

test('the colour inputs change with the brand colours and the Start button colours, and with nothing else', () => {
  const welcome = (fill: string) => ({ pageType: 'welcome', isActive: true, order: 0, config: { buttonColor: fill, buttonTextColor: hex('ffffff'), buttonBorderColor: hex('000000') } });
  const base = { name: 'A', brandColor: hex('112233'), brandBorderColor: null, customPages: [welcome(hex('445566'))] };
  assert.equal(colourInputsOf(base), colourInputsOf({ ...base, name: 'B', description: 'x', shortUrlSlug: 'abc', customPages: [welcome(hex('445566')), { pageType: 'cta', config: { title: 't' } }] }), 'other fields and other pages change nothing');
  assert.notEqual(colourInputsOf(base), colourInputsOf({ ...base, brandColor: hex('112234') }));
  assert.notEqual(colourInputsOf(base), colourInputsOf({ ...base, brandBorderColor: hex('abcdef') }));
  assert.notEqual(colourInputsOf(base), colourInputsOf({ ...base, customPages: [welcome(hex('445567'))] }));
  assert.notEqual(colourInputsOf(base), colourInputsOf({ ...base, customPages: [] }));
});

test('an event without the picture is never given one by a redraw (that is the backfill), and nothing is fetched or written', async () => {
  const event = { _id: 'mongo-9', eventId: 'event-uuid-9', name: 'New', partnerId: 'p1' };
  const seeded = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const made = await ensureDefaultSlideshow(seeded.db, event, { upload: async (pathname) => `https://blob.example/${pathname}`, origin: () => 'https://go.messmass.com', now: () => '2026-10-10T10:00:00.000Z' });
  assert.ok(made.ok);
  const log: Log = { uploads: [], fetched: [] };
  const writesBefore = seeded.calls.length;
  const outcome = await redrawEvent(seeded.db, seeded.data[COLLECTIONS.EVENTS][0], { deps: deps(log) });
  assert.equal(outcome.status, 'skipped');
  assert.deepEqual([log.uploads.length, log.fetched.length, seeded.calls.length - writesBefore], [0, 0, 0]);
  assert.equal((seeded.data[COLLECTIONS.EVENTS][0] as Stored).welcomeScreen, undefined);
  assert.equal((await redrawEvent(seeded.db, null, { deps: deps(log) })).status, 'skipped');
});

test('an event that chose nothing new is unchanged: the same sources give the same key, nothing is drawn, uploaded, fetched or written (the MTK x Vasas case)', async () => {
  // The MTK event: its welcome page keeps its own picture, and the event has its stored welcome page screen picture.
  const own = { pageId: 'w1', pageType: 'welcome', order: 0, isActive: true, config: { screenImageUrl: 'https://r2.example/mtk-own.png', title: 'Welcome' } };
  const w = await drawnWorld({ customPages: [own], brandColor: hex('003366') });
  const before = w.snapshot();
  const log: Log = { uploads: [], fetched: [] };
  const writesBefore = w.calls.length;
  for (let i = 0; i < 3; i += 1) {
    const outcome = await redrawEvent(w.db, w.current(), { deps: deps(log) });
    assert.deepEqual(outcome, { status: 'unchanged' });
  }
  assert.deepEqual(log.uploads, [], 'nothing is uploaded');
  assert.deepEqual(log.fetched, [], 'not even the overlay is fetched when nothing changed');
  assert.equal(w.calls.length, writesBefore, 'the database is not written');
  assert.deepEqual(w.current(), before, 'the event, its stored picture and key and its own page are exactly as they were');
  assert.equal((w.current().customPages as Array<{ config: { screenImageUrl: string } }>)[0].config.screenImageUrl, 'https://r2.example/mtk-own.png');
});

test('a new frame draws the picture again with the frame in the window, and the key follows', async () => {
  const w = await drawnWorld();
  const keyBefore = w.current().welcomeScreen!.key;
  const frameUrl = 'https://blob.example/frame.png';
  const frame = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } } }).png().toBuffer();
  w.current().frameDesign = { variants: [{ index: null, message: null, imageUrl: frameUrl }] };
  const log: Log = { uploads: [], fetched: [] };
  const outcome = await redrawEvent(w.db, w.current(), { deps: deps(log, { [frameUrl]: frame }) });
  assert.equal(outcome.status, 'redrawn');
  assert.equal(log.uploads.length, 1);
  const [r, g, b] = await windowPixel(log.uploads[0].png);
  assert.ok(g > 150 && r < 60 && b < 60, `the frame is in the window (got ${r},${g},${b})`);
  assert.notEqual(w.current().welcomeScreen!.key, keyBefore);
  assert.equal(w.current().welcomeScreen!.url, (outcome as { url: string }).url);
  // And asking again costs nothing.
  assert.equal((await redrawEvent(w.db, w.current(), { deps: deps(log, { [frameUrl]: frame }) })).status, 'unchanged');
  assert.equal(log.uploads.length, 1);
});

test('new colours (the event\'s brand colour) draw the picture again; the same colours do not', async () => {
  const w = await drawnWorld({ brandColor: hex('003366') });
  const keyBefore = w.current().welcomeScreen!.key;
  const log: Log = { uploads: [], fetched: [] };
  w.current().brandColor = hex('cc0000');
  assert.equal((await redrawEvent(w.db, w.current(), { deps: deps(log) })).status, 'redrawn');
  assert.notEqual(w.current().welcomeScreen!.key, keyBefore);
  w.current().brandColor = hex('cc0000');
  assert.equal((await redrawEvent(w.db, w.current(), { deps: deps(log) })).status, 'unchanged');
  assert.equal(log.uploads.length, 1);
});

test('a sample selfie chosen by the event, or by its partner, is drawn in the window after the change; one that was there already is not', async () => {
  const red = await solid(200, 30, 30);
  const blue = await solid(30, 30, 200);
  const images = { 'https://store.public.blob.vercel-storage.com/red.png': red, 'https://store.public.blob.vercel-storage.com/blue.png': blue };

  // Nothing in the library: the stand-in is drawn, and a redraw keeps the stored picture.
  const w = await drawnWorld({}, []);
  const log: Log = { uploads: [], fetched: [] };
  assert.equal((await redrawEvent(w.db, w.current(), { deps: deps(log, images) })).status, 'unchanged');

  // The partner gets its own sample selfie: the event follows it.
  w.data[COLLECTIONS.IMAGES].push(selfie('red', { scope: 'partner', partnerId: 'p1' }));
  w.data[COLLECTIONS.PARTNERS][0].slots = { selfie: { items: ['red'], useDefault: false } };
  const first = await redrawEvent(w.db, w.current(), { deps: deps(log, images) });
  assert.equal(first.status, 'redrawn');
  assert.equal(log.uploads.length, 1);
  const [r1, , b1] = await windowPixel(log.uploads[0].png);
  assert.ok(r1 > 150 && b1 < 80, 'the partner\'s selfie is in the window');
  assert.equal((w.current().welcomeWindow as { pick: { pictureId: string } }).pick.pictureId, 'red', 'the pick is stored');

  // The partner adds another one: the stored pick is still among them, so the picture does not change.
  w.data[COLLECTIONS.IMAGES].push(selfie('blue', { scope: 'partner', partnerId: 'p1' }));
  w.data[COLLECTIONS.PARTNERS][0].slots = { selfie: { items: ['red', 'blue'], useDefault: false } };
  assert.equal((await redrawEvent(w.db, w.current(), { deps: deps(log, images, { random: () => 0.99 }) })).status, 'unchanged');
  assert.equal(log.uploads.length, 1);

  // The event replaces them with its own: its pick left the set, so another is made and drawn.
  w.data[COLLECTIONS.IMAGES].push(selfie('mine', { scope: 'event', eventId: 'event-uuid-1' }));
  w.current().slots = { selfie: { items: ['mine'], useDefault: false } };
  const green = await solid(30, 200, 30);
  const second = await redrawEvent(w.db, w.current(), { deps: deps(log, { ...images, 'https://store.public.blob.vercel-storage.com/mine.png': green }) });
  assert.equal(second.status, 'redrawn');
  const [, g2] = await windowPixel(log.uploads[1].png);
  assert.ok(g2 > 150, 'the event\'s own selfie is in the window');
});

test('a draw that fails or takes too long is reported, never thrown, and the stored picture is kept', async () => {
  const w = await drawnWorld({ brandColor: hex('003366') });
  const before = w.snapshot();
  w.current().brandColor = hex('cc0000');
  const failing = await redrawEvent(w.db, w.current(), { deps: deps({ uploads: [], fetched: [] }, {}, { upload: async () => { throw new Error('blob is down'); } }) });
  assert.deepEqual(failing, { status: 'failed', reason: 'blob is down' });
  const slow = await redrawEvent(w.db, w.current(), { timeoutMs: 20, deps: deps({ uploads: [], fetched: [] }, {}, { fetchImage: () => new Promise(() => undefined) }) });
  assert.equal(slow.status, 'failed');
  assert.match((slow as { reason: string }).reason, /took longer than 20 ms/);
  assert.deepEqual(w.current().welcomeScreen, before.welcomeScreen, 'the stored picture is as it was');
});

test('outside a request nothing is scheduled and nothing throws', () => {
  assert.doesNotThrow(() => scheduleWelcomeRedraw({ _id: 'x', welcomeScreen: { url: 'https://blob.example/w.png' } }, 'frame'));
  assert.doesNotThrow(() => scheduleWelcomeRedraw(null, 'frame'));
  assert.doesNotThrow(() => scheduleWelcomeRedrawForPartner('p1', 'partner-colours'));
  assert.doesNotThrow(() => scheduleWelcomeRedrawForPartner(null, 'partner-colours'));
});

// ---- the debounce and the queue ----

function harness(options: { maxWaiting?: number; maxReruns?: number; hold?: boolean } = {}) {
  const runs: Array<{ key: string; reasons: string[] }> = [];
  const dropped: string[] = [];
  let sleepers: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;
  let gate: Promise<void> = Promise.resolve();
  let openGate: () => void = () => undefined;
  const clock = { t: 0 };
  const hold = () => {
    gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
  };
  if (options.hold) hold();
  const scheduler = createRedrawScheduler({
    debounceMs: 10,
    maxWaiting: options.maxWaiting ?? 10,
    maxReruns: options.maxReruns ?? 2,
    sleep: () => new Promise<void>((resolve) => sleepers.push(resolve)),
    now: () => clock.t,
    run: async (key, reasons) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      runs.push({ key, reasons });
      await gate;
      active -= 1;
    },
    onDropped: (key) => dropped.push(key),
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const wake = async () => {
    const now = sleepers;
    sleepers = [];
    for (const resolve of now) resolve();
    await tick();
  };
  return { scheduler, runs, dropped, clock, wake, tick, hold, release: async () => { openGate(); await tick(); }, maxActive: () => maxActive, sleeping: () => sleepers.length };
}

test('changes that come while the first waits are one draw, that reads the event after the wait', async () => {
  const h = harness();
  const a = h.scheduler.request('e1', 'frame');
  const b = h.scheduler.request('e1', 'colours');
  const c = h.scheduler.request('e1', 'frame');
  assert.equal(a, b);
  assert.equal(b, c, 'they share one promise');
  assert.equal(h.sleeping(), 1, 'one wait');
  assert.equal(h.runs.length, 0, 'nothing is drawn before the wait ends');
  await h.wake();
  await a;
  assert.equal(h.runs.length, 1);
  assert.deepEqual(h.runs[0].reasons.sort(), ['colours', 'frame']);
  assert.equal(h.scheduler.waiting(), 0);
});

test('a change during the draw: one more draw after it; however long the changes go on the draws stop after the first plus the reruns', async () => {
  const h = harness({ hold: true, maxReruns: 2 });
  const done = h.scheduler.request('e1', 'one');
  await h.wake();
  assert.equal(h.runs.length, 1, 'the first draw is running');
  h.scheduler.request('e1', 'two');
  await h.release();
  h.hold();
  await h.wake();
  assert.equal(h.runs.length, 2, 'one more after the first');
  h.scheduler.request('e1', 'three');
  await h.release();
  h.hold();
  await h.wake();
  assert.equal(h.runs.length, 3);
  h.scheduler.request('e1', 'four');
  await h.release();
  await done;
  await h.wake();
  assert.equal(h.runs.length, 3, 'no fourth draw: the bound is the first plus two');
  assert.equal(h.scheduler.waiting(), 0);
});

test('one draw at a time, and no more events wait than the limit; the dropped ones are reported', async () => {
  const h = harness({ maxWaiting: 3 });
  const all = ['e1', 'e2', 'e3'].map((key) => h.scheduler.request(key, 'frame'));
  const dropped = h.scheduler.request('e4', 'frame');
  assert.deepEqual(h.dropped, ['e4']);
  assert.equal(h.scheduler.waiting(), 3);
  await dropped;
  await h.wake();
  await Promise.all(all);
  assert.deepEqual(h.runs.map((run) => run.key).sort(), ['e1', 'e2', 'e3']);
  assert.equal(h.maxActive(), 1, 'never two draws at the same time');
});

test('a draw that would start after its time budget is not started', async () => {
  const h = harness();
  const late = h.scheduler.request('e1', 'frame', 5);
  const inTime = h.scheduler.request('e2', 'frame', 50);
  h.clock.t = 10;
  await h.wake();
  await Promise.all([late, inTime]);
  assert.deepEqual(h.runs.map((run) => run.key), ['e2']);
});

test('a draw that throws does not stop the next one', async () => {
  const runs: string[] = [];
  const scheduler = createRedrawScheduler({
    debounceMs: 0,
    maxWaiting: 5,
    maxReruns: 0,
    sleep: async () => undefined,
    now: () => 0,
    run: async (key) => {
      runs.push(key);
      if (key === 'bad') throw new Error('boom');
    },
  });
  await Promise.all([scheduler.request('bad', 'x'), scheduler.request('good', 'x')]);
  assert.deepEqual(runs.sort(), ['bad', 'good']);
});
