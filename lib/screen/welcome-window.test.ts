import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveFrameFont } from '@/lib/frame/fonts';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { clearBrokenCache } from '@/lib/media/pictures';
import { COLLECTIONS } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, CAMERA_DEFAULT_CTA_BRAND_COLOR } from '@/lib/gds/tokens/colors';
import { renderDefaultOverlay } from './default-stage';
import { ensureWelcomeScreen, type WelcomeScreenDeps } from './welcome-screen-store';
import { parseWindowRequest, planWindow, windowSourceOf } from './welcome-window';

const EVENT = { _id: 'mongo-1', eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'p1' };
const OVERLAY = renderDefaultOverlay({ background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR });
const selfie = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: pictureId, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['sample-selfie'], scope: 'global', createdAt: '2026-10-01T00:00:00.000Z', ...extra });
const solid = (r: number, g: number, b: number) => sharp({ create: { width: 400, height: 500, channels: 3, background: { r, g, b } } }).png().toBuffer();

interface Log { uploads: Array<{ pathname: string; png: Buffer }>; fetched: string[] }

function deps(log: Log, images: Record<string, Buffer | null>, random = () => 0): WelcomeScreenDeps {
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
    now: () => '2026-10-10T12:00:00.000Z',
    random,
  };
}

async function world(images: Array<Record<string, unknown>>, eventExtra: Record<string, unknown> = {}) {
  const event = { ...EVENT, ...eventExtra };
  const seeded = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }], images });
  const made = await ensureDefaultSlideshow(seeded.db, event, { upload: async (pathname) => `https://blob.example/${pathname}`, origin: () => 'https://go.messmass.com', now: () => '2026-10-10T10:00:00.000Z' });
  assert.ok(made.ok);
  return { ...seeded, event: seeded.data[COLLECTIONS.EVENTS][0] as typeof event & { welcomeWindow?: { source?: string; pick?: { pictureId: string } }; welcomeScreen?: { key: string } } };
}

/** The colour at the middle of the photo window of a drawn picture (the window of the default design is the left 70 % of the stage). */
async function windowPixel(png: Buffer): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x = Math.round(info.width * 0.35);
  const y = Math.round(info.height * 0.5);
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

test('the setting: the sample selfie unless the stand-in was chosen; a request names a known source and a true or false', () => {
  assert.equal(windowSourceOf({}), 'selfie');
  assert.equal(windowSourceOf({ welcomeWindow: { source: 'standin' } }), 'standin');
  assert.equal(windowSourceOf({ welcomeWindow: { source: 'weird' } }), 'selfie');
  assert.deepEqual(parseWindowRequest({ source: 'standin', again: true }), { ok: true, value: { source: 'standin', again: true } });
  for (const bad of [null, [], 'x', { source: 'photo' }, { again: 'yes' }, { other: 1 }]) assert.equal(parseWindowRequest(bad).ok, false, JSON.stringify(bad));
});

test('the plan puts the stored pick first, leaves out the pictures known to be gone, and makes a new pick when it left the set or when asked', async () => {
  clearBrokenCache();
  const w = await world([selfie('a'), selfie('b'), selfie('c')]);
  const first = await planWindow(w.db, w.event, { random: () => 0 });
  assert.equal(first.candidates[0].id, first.candidates.find(Boolean)!.id);
  assert.equal(first.keyPart, `selfie:${first.candidates[0].id}:${first.candidates[0].url}`);
  const stored = { ...w.event, welcomeWindow: { pick: { pictureId: 'b', pickedAt: 'x' } } };
  assert.equal((await planWindow(w.db, stored, { random: () => 0 })).candidates[0].id, 'b', 'the stored pick stays');
  assert.notEqual((await planWindow(w.db, stored, { again: true, random: () => 0 })).candidates[0].id, 'b', 'again: another one');
  assert.equal((await planWindow(w.db, { ...w.event, welcomeWindow: { pick: { pictureId: 'gone', pickedAt: 'x' } } }, { random: () => 0 })).candidates.length, 3, 'a pick that left the set is replaced');
  assert.deepEqual((await planWindow(w.db, { ...w.event, welcomeWindow: { source: 'standin' } })).candidates, [], 'the stand-in has no candidates');
  w.data.picture_health = [{ _id: 'https://store.public.blob.vercel-storage.com/a.png', broken: true } as never];
  clearBrokenCache();
  assert.ok(!(await planWindow(w.db, w.event, { random: () => 0 })).candidates.some((item) => item.id === 'a'), 'a picture known to be gone is not tried');
  clearBrokenCache();
});

test('with no sample selfie the stand-in is drawn, as before; with one it is drawn in the window, stored as the pick, and drawing again with nothing changed draws nothing', async () => {
  clearBrokenCache();
  const none = await world([]);
  const log0: Log = { uploads: [], fetched: [] };
  const standIn = await ensureWelcomeScreen(none.db, none.event, deps(log0, {}));
  assert.ok(standIn.ok && standIn.created);
  assert.equal(none.event.welcomeWindow, undefined, 'no pick is stored when there is none');

  const red = await solid(220, 20, 20);
  const w = await world([selfie('a')]);
  const log: Log = { uploads: [], fetched: [] };
  const first = await ensureWelcomeScreen(w.db, w.event, deps(log, { 'https://store.public.blob.vercel-storage.com/a.png': red }));
  assert.ok(first.ok && first.created);
  const [r, g, b] = await windowPixel(log.uploads[0].png);
  assert.ok(r > 150 && g < 90 && b < 90, `the window shows the sample selfie (${r},${g},${b})`);
  assert.equal(w.event.welcomeWindow?.pick?.pictureId, 'a');
  const second = await ensureWelcomeScreen(w.db, w.event, deps(log, { 'https://store.public.blob.vercel-storage.com/a.png': red }));
  assert.ok(second.ok && !second.created);
  assert.equal(log.uploads.length, 1, 'nothing is drawn again');
  assert.equal(log.fetched.filter((url) => url.endsWith('/a.png')).length, 1, 'the selfie is not fetched again either');
});

test('a sample selfie added later does not change the picture of an event that has its pick; "again" picks another and draws it', async () => {
  clearBrokenCache();
  const red = await solid(220, 20, 20);
  const blue = await solid(20, 20, 220);
  const images = { 'https://store.public.blob.vercel-storage.com/a.png': red, 'https://store.public.blob.vercel-storage.com/b.png': blue };
  const w = await world([selfie('a')]);
  const log: Log = { uploads: [], fetched: [] };
  await ensureWelcomeScreen(w.db, w.event, deps(log, images));
  w.data[COLLECTIONS.IMAGES].push(selfie('b', { createdAt: '2026-10-09T00:00:00.000Z' }));
  const again = await ensureWelcomeScreen(w.db, w.event, deps(log, images));
  assert.ok(again.ok && !again.created, 'a new global sample selfie does not change the picture of an event that has its pick');
  const other = await ensureWelcomeScreen(w.db, w.event, deps(log, images), { again: true });
  assert.ok(other.ok && other.created);
  assert.equal(w.event.welcomeWindow?.pick?.pictureId, 'b');
  const [r, , b] = await windowPixel(log.uploads.at(-1)!.png);
  assert.ok(b > 150 && r < 90, 'the other selfie is drawn');
});

test('a sample selfie that cannot be fetched is skipped for the next and becomes the pick; with none fetched the stand-in is drawn and no pick is stored', async () => {
  clearBrokenCache();
  const blue = await solid(20, 20, 220);
  const w = await world([selfie('a'), selfie('b')]);
  const log: Log = { uploads: [], fetched: [] };
  const result = await ensureWelcomeScreen(w.db, w.event, deps(log, { 'https://store.public.blob.vercel-storage.com/a.png': null, 'https://store.public.blob.vercel-storage.com/b.png': blue }));
  assert.ok(result.ok);
  assert.equal(w.event.welcomeWindow?.pick?.pictureId, 'b');
  const [r, , b] = await windowPixel(log.uploads[0].png);
  assert.ok(b > 150 && r < 90);

  const lost = await world([selfie('a')]);
  const log2: Log = { uploads: [], fetched: [] };
  const drawn = await ensureWelcomeScreen(lost.db, lost.event, deps(log2, { 'https://store.public.blob.vercel-storage.com/a.png': null }));
  assert.ok(drawn.ok && drawn.created);
  assert.equal(lost.event.welcomeWindow, undefined, 'no pick for a picture that could not be fetched');
});

test('an event that keeps the stand-in never fetches a sample selfie', async () => {
  clearBrokenCache();
  const w = await world([selfie('a')], { welcomeWindow: { source: 'standin' } });
  const log: Log = { uploads: [], fetched: [] };
  const result = await ensureWelcomeScreen(w.db, w.event, deps(log, {}));
  assert.ok(result.ok);
  assert.ok(!log.fetched.some((url) => url.endsWith('/a.png')));
});
