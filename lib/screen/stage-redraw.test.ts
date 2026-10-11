import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { clearBrokenCache } from '@/lib/media/pictures';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { redrawStage, stageState, type StageRedrawDeps } from './stage-redraw';

const NOW = '2026-10-11T12:00:00.000Z';
const bg = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Stadium ${pictureId}`, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['stadium-background'], scope: 'global', createdAt: `2026-10-01T00:00:0${pictureId.charCodeAt(pictureId.length - 1) % 10}.000Z`, ...extra });
const solid = (r: number, g: number, b: number) => sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r, g, b } } }).png().toBuffer();

interface Log {
  uploads: Array<{ pathname: string; png: Buffer }>;
}

function deps(log: Log, pictures: Record<string, Buffer> = {}, random = () => 0): StageRedrawDeps {
  return {
    upload: async (pathname, png) => {
      log.uploads.push({ pathname, png });
      return `https://blob.example/${pathname}`;
    },
    now: () => NOW,
    background: { fetchImage: async (url) => pictures[url] ?? null, random },
  };
}

async function world(images: Array<Record<string, unknown>> = [], eventExtra: Record<string, unknown> = {}) {
  clearBrokenCache();
  const event = { _id: 'm1', eventId: 'E', name: 'Match', partnerId: 'P', ...eventExtra };
  const seeded = fakeDb({ events: [event], partners: [{ partnerId: 'P', name: 'MTK' }], images });
  // The slideshow as a new event has it, made while the library was empty: the stage of today.
  const made = await ensureDefaultSlideshow(seeded.db, event, { upload: async (pathname) => `https://blob.example/${pathname}`, origin: () => 'https://go.messmass.com', now: () => '2026-10-10T10:00:00.000Z', background: { fetchImage: async () => null } });
  assert.ok(made.ok);
  return { ...seeded, event: () => seeded.data[COLLECTIONS.EVENTS][0], slideshow: () => seeded.data[COLLECTIONS.SLIDESHOWS][0] as { screenDesign: { overlayImageUrl: string }; reloadRequestedAt?: string; updatedAt: string } };
}

async function cornerPixel(png: Buffer): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (3 * info.width + Math.round(info.width / 2)) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

test('an event whose library is empty is unchanged: the same stage, the same address, nothing stored or written to its slideshow', async () => {
  const w = await world();
  const before = JSON.stringify(w.slideshow());
  const eventBefore = JSON.stringify(w.event());
  const log: Log = { uploads: [] };
  const slideshowWrites = w.calls.filter((call) => call.collection === COLLECTIONS.SLIDESHOWS).length;
  const result = await redrawStage(w.db, w.event(), deps(log));
  assert.ok(result.ok);
  assert.equal(result.changed, false);
  assert.equal(result.url, w.slideshow().screenDesign.overlayImageUrl, 'the stage is the very same picture, at the very same address');
  assert.equal(JSON.stringify(w.slideshow()), before, 'the slideshow is exactly as it was');
  assert.equal(JSON.stringify(w.event()), eventBefore, 'no pick is stored');
  assert.equal(w.calls.filter((call) => call.collection === COLLECTIONS.SLIDESHOWS).length, slideshowWrites, 'nothing is written to the slideshow');
});

test('with a stadium background to use, the stage is drawn on it in the event\'s colours, the slideshow points at it, the open screens reload and the pick is kept; asking again changes nothing', async () => {
  const url = 'https://store.public.blob.vercel-storage.com/a.png';
  const w = await world([bg('a')]);
  const original = w.slideshow().screenDesign.overlayImageUrl;
  const log: Log = { uploads: [] };
  const red = await solid(200, 20, 20);
  const result = await redrawStage(w.db, w.event(), deps(log, { [url]: red }));
  assert.ok(result.ok && result.changed);
  assert.notEqual(result.url, original);
  assert.equal(w.slideshow().screenDesign.overlayImageUrl, result.url);
  assert.equal(w.slideshow().reloadRequestedAt, NOW, 'the open screens reload, as after any save of the slideshow');
  assert.deepEqual(w.event().stageBackground, { pictureId: 'a', pickedAt: NOW });
  const [r, g, b] = await cornerPixel(log.uploads[0].png);
  assert.ok(r > 100 && r > g + 40 && r > b + 40, `the red stadium shows through the event's colours at the top of the stage (got ${r},${g},${b})`);
  assert.match(log.uploads[0].pathname, /^screens\/E\/default-[0-9a-f]{16}\.png$/);

  const again = await redrawStage(w.db, w.event(), deps(log, { [url]: red }));
  assert.ok(again.ok);
  assert.equal(again.changed, false);
  assert.equal(again.url, result.url);
});

test('Pick another takes another of the stadium backgrounds; the pick it replaces is not the one drawn', async () => {
  const w = await world([bg('a'), bg('b')], { stageBackground: { pictureId: 'b', pickedAt: NOW } });
  const pictures = { 'https://store.public.blob.vercel-storage.com/a.png': await solid(200, 20, 20), 'https://store.public.blob.vercel-storage.com/b.png': await solid(20, 20, 200) };
  const log: Log = { uploads: [] };
  const same = await redrawStage(w.db, w.event(), deps(log, pictures));
  assert.ok(same.ok && same.changed);
  assert.equal((w.event().stageBackground as { pictureId: string }).pictureId, 'b', 'the stored pick stays');
  const other = await redrawStage(w.db, w.event(), deps(log, pictures), { again: true });
  assert.ok(other.ok && other.changed);
  assert.equal((w.event().stageBackground as { pictureId: string }).pictureId, 'a');
});

test('choosing none for the event goes back to the stage drawn by code, the very one it had, and removes the pick', async () => {
  const w = await world([bg('a')]);
  const original = w.slideshow().screenDesign.overlayImageUrl;
  const pictures = { 'https://store.public.blob.vercel-storage.com/a.png': await solid(200, 20, 20) };
  const log: Log = { uploads: [] };
  await redrawStage(w.db, w.event(), deps(log, pictures));
  assert.notEqual(w.slideshow().screenDesign.overlayImageUrl, original);
  w.event().slots = { stadium: { useDefault: false } };
  const back = await redrawStage(w.db, w.event(), deps(log, pictures));
  assert.ok(back.ok && back.changed);
  assert.equal(back.url, original, 'the same picture at the same address as before the library had anything');
  assert.equal(w.event().stageBackground, undefined);
});

test('a slideshow whose stage picture an editor chose is never touched (the designers\' picture of MTK x Vasas)', async () => {
  const w = await world([bg('a')]);
  (w.slideshow().screenDesign as { overlayImageUrl: string }).overlayImageUrl = 'https://pub.r2.dev/landing/mtk-vasas/Seyu_MTK_VASAS_Overlay2.png';
  const before = JSON.stringify(w.data);
  const log: Log = { uploads: [] };
  const result = await redrawStage(w.db, w.event(), deps(log, { 'https://store.public.blob.vercel-storage.com/a.png': await solid(200, 20, 20) }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /stage picture of its own/);
  assert.deepEqual(log.uploads, []);
  assert.equal(JSON.stringify(w.data), before);
  const state = await stageState(w.db, w.event());
  assert.equal(state.generated, false);
});

test('an event with no default slideshow cannot have its stage drawn, and says why', async () => {
  const seeded = fakeDb({ events: [{ _id: 'm1', eventId: 'E', name: 'Match' }] });
  const result = await redrawStage(seeded.db, seeded.data[COLLECTIONS.EVENTS][0], deps({ uploads: [] }));
  assert.deepEqual(result, { ok: false, reason: 'The event has no default slideshow.' });
  assert.equal((await stageState(seeded.db, seeded.data[COLLECTIONS.EVENTS][0])).slideshowId, null);
});

test('the state says whether the stage is the system\'s, what it is drawn on and how many the event can use', async () => {
  const w = await world([bg('a'), bg('b')], { stageBackground: { pictureId: 'a', pickedAt: NOW } });
  const state = await stageState(w.db, w.event());
  assert.equal(state.generated, true);
  assert.equal(state.available, 2);
  assert.deepEqual(state.pick, { id: 'a', name: 'Stadium a', imageUrl: 'https://store.public.blob.vercel-storage.com/a.png' });
  assert.equal(state.overlayUrl, w.slideshow().screenDesign.overlayImageUrl);
  w.data[COLLECTIONS.IMAGES].find((doc) => doc.pictureId === 'a')!.isActive = false;
  assert.equal((await stageState(w.db, w.event())).pick, null, 'a switched off pick is not shown as the one in use');
});
