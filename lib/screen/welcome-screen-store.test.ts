import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveFrameFont } from '@/lib/frame/fonts';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { renderDefaultOverlay } from './default-stage';
import { SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, CAMERA_DEFAULT_CTA_BRAND_COLOR } from '@/lib/gds/tokens/colors';
import { ensureWelcomeScreen, type WelcomeScreenDeps } from './welcome-screen-store';

const EVENT = { _id: 'mongo-1', eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'p1' };
const OVERLAY = renderDefaultOverlay({ background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR });

function deps(log: { uploads: string[]; fetched: string[] }, images: Record<string, Buffer> = {}): WelcomeScreenDeps {
  return {
    upload: async (pathname) => {
      log.uploads.push(pathname);
      return `https://blob.example/${pathname}`;
    },
    fetchImage: async (url) => {
      log.fetched.push(url);
      return images[url] ?? OVERLAY;
    },
    resolveFont: (style) => resolveFrameFont(style),
    now: () => '2026-10-09T12:00:00.000Z',
  };
}

async function eventWithDefaultSlideshow(extra: Record<string, unknown> = {}) {
  const event = { ...EVENT, ...extra };
  const seeded = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const made = await ensureDefaultSlideshow(seeded.db, event, {
    upload: async (pathname) => `https://blob.example/${pathname}`,
    pickIndex: () => 0,
    origin: () => 'https://go.messmass.com',
    now: () => '2026-10-09T10:00:00.000Z',
  });
  assert.ok(made.ok);
  return { ...seeded, event };
}

test('it draws the picture from the default slideshow, stores it and records what it was drawn from', async () => {
  const { db, data, event } = await eventWithDefaultSlideshow();
  const log = { uploads: [] as string[], fetched: [] as string[] };
  const result = await ensureWelcomeScreen(db, event, deps(log));
  assert.ok(result.ok && result.created);
  assert.equal(log.uploads.length, 1);
  assert.match(log.uploads[0], /^screens\/event-uuid-1\/welcome-[0-9a-f]{16}\.png$/);
  const stored = (data.events[0] as { welcomeScreen: { url: string; key: string; generatedAt: string; renderVersion: number } }).welcomeScreen;
  assert.equal(stored.url, result.url);
  assert.equal(stored.generatedAt, '2026-10-09T12:00:00.000Z');
  assert.match(stored.key, /^[0-9a-f]{64}$/);
  const overlayUrl = (data.slideshows[0] as { screenDesign: { overlayImageUrl: string } }).screenDesign.overlayImageUrl;
  assert.ok(log.fetched.includes(overlayUrl), 'the overlay of the design was fetched');
});

test('asking again with nothing changed draws nothing: the stored picture is kept', async () => {
  const { db, data, event } = await eventWithDefaultSlideshow();
  const log = { uploads: [] as string[], fetched: [] as string[] };
  const first = await ensureWelcomeScreen(db, event, deps(log));
  const stored = data.events[0];
  const second = await ensureWelcomeScreen(db, stored, deps(log));
  assert.ok(first.ok && second.ok);
  assert.equal(second.created, false);
  assert.equal(second.url, first.url);
  assert.equal(log.uploads.length, 1);
});

test('when the design changes (another QR address) the picture is drawn again; the key follows', async () => {
  const { db, data, event } = await eventWithDefaultSlideshow();
  const log = { uploads: [] as string[], fetched: [] as string[] };
  await ensureWelcomeScreen(db, event, deps(log));
  const before = (data.events[0] as { welcomeScreen: { key: string } }).welcomeScreen.key;
  (data.slideshows[0] as { screenDesign: { qr: { url: string } } }).screenDesign.qr.url = 'https://go.messmass.com/other1';
  const again = await ensureWelcomeScreen(db, data.events[0], deps(log));
  assert.ok(again.ok && again.created);
  assert.notEqual((data.events[0] as { welcomeScreen: { key: string } }).welcomeScreen.key, before);
  assert.equal(log.uploads.length, 2);
});

test('the event\'s frame is fetched and drawn in the window, and it is part of what the picture is drawn from', async () => {
  const frameUrl = 'https://blob.example/frame.png';
  const frame = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } } }).png().toBuffer();
  const { db, data, event } = await eventWithDefaultSlideshow();
  const log = { uploads: [] as string[], fetched: [] as string[] };
  await ensureWelcomeScreen(db, event, deps(log));
  const without = (data.events[0] as { welcomeScreen: { key: string } }).welcomeScreen.key;
  assert.ok(!log.fetched.includes(frameUrl));

  // The same event once its frame has been generated: same slideshow, same colours, one more thing to draw from.
  const framed = { ...data.events[0], frameDesign: { variants: [{ index: null, message: null, imageUrl: frameUrl }] } };
  const result = await ensureWelcomeScreen(db, framed, deps(log, { [frameUrl]: frame }));
  assert.ok(result.ok && result.created);
  assert.ok(log.fetched.includes(frameUrl));
  assert.notEqual((data.events[0] as { welcomeScreen: { key: string } }).welcomeScreen.key, without);
});

test('no default slideshow, no screen design or no overlay: it says why and stores nothing', async () => {
  const none = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const log = { uploads: [] as string[], fetched: [] as string[] };
  const a = await ensureWelcomeScreen(none.db, EVENT, deps(log));
  assert.ok(!a.ok && /no default slideshow/.test(a.reason));

  const { db, data, event } = await eventWithDefaultSlideshow();
  const b = await ensureWelcomeScreen(db, event, { ...deps(log), fetchImage: async () => null });
  assert.ok(!b.ok && /overlay/.test(b.reason));
  assert.equal(log.uploads.length, 0);
  assert.equal((data.events[0] as { welcomeScreen?: unknown }).welcomeScreen, undefined);
});

test('a page\'s own screen picture is never touched: the picture is stored on the event, not in its pages', async () => {
  const own = { pageId: 'w1', pageType: 'welcome', order: 0, isActive: true, config: { screenImageUrl: 'https://r2.example/own.png' } };
  const { db, data, event } = await eventWithDefaultSlideshow({ customPages: [own] });
  await ensureWelcomeScreen(db, event, deps({ uploads: [], fetched: [] }));
  assert.deepEqual((data.events[0] as { customPages: unknown[] }).customPages, [own]);
});
