import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { parseScreenDesign } from './screen-design';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DEFAULT_STAGE, renderDefaultOverlay } from '@/lib/screen/default-stage';
import { clearBrokenCache } from '@/lib/media/pictures';
import { loadEventTheme } from '@/lib/theme/load';
import { COLLECTIONS } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { GIANT_SCREEN_PLACEMENT, applyPartnerSlideshowDefault, ensureDefaultSlideshow, findDefaultSlideshow, writtenAddress, type DefaultSlideshowDeps } from './default-slideshow';
import { en } from '@/lib/i18n/messages.en';
import { hu } from '@/lib/i18n/messages.hu';

const EVENT = { _id: 'mongo-1', eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'p1', frameDesign: undefined as unknown };

function deps(uploads: Array<{ pathname: string; bytes: number }> = []): DefaultSlideshowDeps {
  return {
    upload: async (pathname, png) => {
      uploads.push({ pathname, bytes: png.length });
      return `https://blob.example/${pathname}`;
    },
    origin: () => 'https://go.messmass.com',
    now: () => '2026-10-09T10:00:00.000Z',
  };
}

test('clearing the partner screen design restores the event baseline and keeps its tracked QR URL', async () => {
  const baselineDesign = { overlayImageUrl: 'https://blob.example/event-stage.png', qr: { url: 'https://go.messmass.com/mtk-event', x: 1 }, texts: [] };
  const source = {
    _id: 'slideshow-1', slideshowId: 's1', eventId: EVENT.eventId, eventName: EVENT.name, name: 'Old inherited screen',
    isActive: true, isDefault: true, createdBy: 'system', inheritedFromPartnerId: EVENT.partnerId, inheritedPartnerRevision: 1,
    inheritanceBaseline: { name: 'Generated', isActive: true, transitionDurationMs: 5000, fadeDurationMs: 1000, bufferSize: 10, refreshStrategy: 'continuous', playMode: 'loop', orderMode: 'fixed', crossfade: false, backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, backgroundImageUrl: null, viewportScale: 'fit', stageAspect: null, screenDesign: baselineDesign },
    screenDesign: { overlayImageUrl: 'https://partner.example/old.png', qr: { url: 'https://go.messmass.com/mtk-event', x: 99 }, texts: [{ text: 'old' }] },
  };
  const { db } = fakeDb({
    [COLLECTIONS.PARTNERS]: [{ partnerId: EVENT.partnerId, contentDefaults: { revision: 2, slideshow: { name: 'Partner screen', isActive: true, transitionDurationMs: 5000, fadeDurationMs: 1000, bufferSize: 10, refreshStrategy: 'continuous', playMode: 'loop', orderMode: 'fixed', crossfade: false, backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, backgroundImageUrl: null, viewportScale: 'fit', stageAspect: null, screenDesign: null } } }],
    [COLLECTIONS.SLIDESHOWS]: [source],
  });

  const updated = await applyPartnerSlideshowDefault(db, EVENT, source as never);
  assert.deepEqual(updated.screenDesign, baselineDesign);
  assert.equal(updated.inheritedPartnerRevision, 2);
});

test('removing the partner slideshow default restores the generated event baseline and clears inheritance', async () => {
  const baseline = {
    name: 'Generated event screen', isActive: true, transitionDurationMs: 5000, fadeDurationMs: 1000,
    bufferSize: 10, refreshStrategy: 'continuous', playMode: 'loop', orderMode: 'fixed', crossfade: false,
    backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
    backgroundImageUrl: null, viewportScale: 'fit', stageAspect: null,
    screenDesign: { overlayImageUrl: 'https://blob.example/event.png', qr: { url: 'https://go.messmass.com/event-qr' }, texts: [] },
  };
  const source = {
    _id: 'slideshow-1', slideshowId: 's1', eventId: EVENT.eventId, isDefault: true, createdBy: 'system',
    inheritedFromPartnerId: EVENT.partnerId, inheritedPartnerRevision: 3, inheritanceBaseline: baseline,
    ...baseline, name: 'Inherited partner screen', backgroundPrimaryColor: '#112233',
  };
  const { db, data } = fakeDb({
    [COLLECTIONS.PARTNERS]: [{ partnerId: EVENT.partnerId, contentDefaults: { revision: 4, slideshow: null } }],
    [COLLECTIONS.SLIDESHOWS]: [source],
  });

  const updated = await applyPartnerSlideshowDefault(db, EVENT, source as never);

  assert.equal(updated.name, baseline.name);
  assert.equal(updated.backgroundPrimaryColor, baseline.backgroundPrimaryColor);
  assert.deepEqual(updated.screenDesign, baseline.screenDesign);
  assert.equal(updated.inheritedFromPartnerId, undefined);
  assert.equal(updated.inheritanceBaseline, undefined);
  assert.equal(data.slideshows[0].inheritedFromPartnerId, undefined);
  assert.equal(data.slideshows[0].inheritanceBaseline, undefined);
});

test('a new event gets a default slideshow: picture, tracked link and one line, the written address', async () => {
  const { db, data } = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  const result = await ensureDefaultSlideshow(db, EVENT, deps(uploads));
  assert.ok(result.ok && result.created);

  const links = data.short_links;
  assert.equal(links.length, 1);
  assert.equal(links[0].placement, GIANT_SCREEN_PLACEMENT);
  assert.equal(links[0].kind, 'qr');
  assert.equal(links[0].eventId, 'mongo-1', 'the link belongs to the event by its database id, as the links list expects');

  assert.equal(uploads.length, 1);
  assert.match(uploads[0].pathname, /^screens\/event-uuid-1\/default-[0-9a-f]{16}\.png$/);
  assert.ok(uploads[0].bytes > 1000);

  const show = data.slideshows[0];
  assert.equal(show.eventId, 'event-uuid-1', 'a slideshow holds the event UUID');
  assert.equal(show.isDefault, true);
  assert.equal(show.isActive, true);
  assert.equal(show.name, en['screen.slideshow.name']);
  const design = show.screenDesign as { qr: { url: string; x: number }; texts: Array<{ text: string; x: number; y: number; width: number; size: number; fit?: boolean }> };
  assert.equal(design.qr.url, `https://go.messmass.com/${links[0].slug}`);
  assert.equal(design.qr.x, DEFAULT_STAGE.qr.x);
  assert.equal(design.texts.length, 1, 'one line under the photos');
  assert.equal(design.texts[0].text, `go.messmass.com/${links[0].slug}`, 'the written address has no protocol; an event without an address of its own writes its link');
  assert.equal(design.texts[0].fit, true, 'scaled to fill the box');
  assert.equal(design.texts[0].x, DEFAULT_STAGE.window.left);
  assert.equal(design.texts[0].width, DEFAULT_STAGE.window.width, 'the box is as wide as the photo window');
  assert.ok(parseScreenDesign(show.screenDesign).ok, 'the stored design passes the same check as an editor\'s');
});

test('asking again changes nothing: one slideshow, one link, no second picture', async () => {
  const { db, data } = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  const first = await ensureDefaultSlideshow(db, EVENT, deps(uploads));
  const second = await ensureDefaultSlideshow(db, EVENT, deps(uploads));
  assert.ok(first.ok && second.ok);
  assert.equal(second.created, false);
  assert.equal(second.slideshowId, first.slideshowId);
  assert.equal(data.slideshows.length, 1);
  assert.equal(data.short_links.length, 1);
  assert.equal(uploads.length, 1);
  assert.equal((await findDefaultSlideshow(db, 'event-uuid-1'))?.slideshowId, first.slideshowId);
});

test('a "Giant screen" link the event already has is reused, so a retry after a failed upload leaves one link', async () => {
  const { db, data } = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const failing: DefaultSlideshowDeps = { ...deps(), upload: async () => { throw new Error('blob down'); } };
  await assert.rejects(ensureDefaultSlideshow(db, EVENT, failing), /blob down/);
  assert.equal(data.slideshows?.length ?? 0, 0, 'nothing half-made for an editor to see');
  const retry = await ensureDefaultSlideshow(db, EVENT, deps());
  assert.ok(retry.ok && retry.created);
  assert.equal(data.short_links.length, 1, 'the link of the first try is used again');
});

test('the slideshows an event already has are left as they are, and its default is added next to them', async () => {
  const own = { slideshowId: 's-own', eventId: 'event-uuid-1', name: 'Main Screen', isActive: true };
  const { db, data } = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }], slideshows: [own] });
  const result = await ensureDefaultSlideshow(db, EVENT, deps());
  assert.ok(result.ok && result.created);
  assert.equal(data.slideshows.length, 2);
  assert.deepEqual(data.slideshows[0], own);
  assert.equal((data.slideshows[0] as { isDefault?: boolean }).isDefault, undefined, 'the existing one is not flagged');
});

test('a Hungarian event gets its Hungarian slideshow name', async () => {
  const event = { ...EVENT, uiLanguage: 'hu' };
  const { db, data } = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  await ensureDefaultSlideshow(db, event, deps());
  const show = data.slideshows[0] as { name: string };
  assert.equal(show.name, hu['screen.slideshow.name']);
});

test('the written address is the event\'s own short address whenever it has one, else the tracked link (owner, 2026-10-09)', async () => {
  assert.equal(writtenAddress('https://go.messmass.com', { shortUrlSlug: 'mtk-vasas' }, 'nts5kd'), 'go.messmass.com/mtk-vasas');
  assert.equal(writtenAddress('https://go.messmass.com', { shortUrlSlug: '  mtk-vasas ' }, 'nts5kd'), 'go.messmass.com/mtk-vasas');
  for (const none of [{}, { shortUrlSlug: null }, { shortUrlSlug: '' }, { shortUrlSlug: '   ' }]) assert.equal(writtenAddress('https://go.messmass.com', none, 'nts5kd'), 'go.messmass.com/nts5kd');

  const event = { ...EVENT, shortUrlSlug: 'mtk-vasas' };
  const { db, data } = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  await ensureDefaultSlideshow(db, event, deps());
  const design = (data.slideshows[0] as { screenDesign: { qr: { url: string }; texts: Array<{ text: string }> } }).screenDesign;
  assert.equal(design.texts[0].text, 'go.messmass.com/mtk-vasas');
  assert.equal(design.qr.url, `https://go.messmass.com/${data.short_links[0].slug}`, 'the QR code still points at the tracked link, so its scans are counted on their own');
});

// ---- the stadium background of the stage (issue 326) ----

const stadium = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Stadium ${pictureId}`, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['stadium-background'], scope: 'global', createdAt: '2026-10-01T00:00:00.000Z', ...extra });
const stadiumPicture = () => sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 20, g: 160, b: 40 } } }).png().toBuffer();

/** The address the stage of the event is stored at when it is drawn by code: the hash of `renderDefaultOverlay` in the event's colours, the function the stage was always made with. */
async function builtInStagePath(seeded: ReturnType<typeof fakeDb>): Promise<string> {
  const theme = await loadEventTheme(seeded.db, EVENT);
  const png = renderDefaultOverlay({ background: theme.background, accent: theme.buttonBackground });
  return `screens/event-uuid-1/default-${createHash('sha256').update(png).digest('hex').slice(0, 16)}.png`;
}

test('an event that chooses nothing gets the stage it always got while the library has no stadium background: the same picture at the same address, no pick stored, nothing fetched', async () => {
  clearBrokenCache();
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  const fetched: string[] = [];
  const result = await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(uploads), background: { fetchImage: async (url) => (fetched.push(url), null) } });
  assert.ok(result.ok && result.created);
  assert.deepEqual(uploads.map((upload) => upload.pathname), [await builtInStagePath(seeded)], 'the stage is the one renderDefaultOverlay draws, at its own address');
  assert.deepEqual(fetched, []);
  assert.equal((seeded.data[COLLECTIONS.EVENTS][0] as { stageBackground?: unknown }).stageBackground, undefined);
});

test('with a stadium background in the library the new stage is drawn on it, the pick is stored on the event, and everything else of the slideshow is exactly what it is without one', async () => {
  clearBrokenCache();
  const plain = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const withLibrary = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], images: [stadium('a')] });
  const picture = await stadiumPicture();
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  await ensureDefaultSlideshow(plain.db, EVENT, deps());
  const result = await ensureDefaultSlideshow(withLibrary.db, EVENT, { ...deps(uploads), background: { fetchImage: async () => picture, random: () => 0 } });
  assert.ok(result.ok && result.created);
  assert.notEqual(uploads[0].pathname, await builtInStagePath(plain), 'another picture, at another address');
  assert.deepEqual(withLibrary.data[COLLECTIONS.EVENTS][0].stageBackground, { pictureId: 'a', pickedAt: '2026-10-09T10:00:00.000Z' });
  const strip = (slideshow: Record<string, unknown>) => {
    const { slideshowId, screenDesign, ...rest } = slideshow as { slideshowId: string; screenDesign: Record<string, unknown> };
    const { overlayImageUrl, qr, texts, ...design } = screenDesign as { overlayImageUrl: string; qr: { url: string }; texts: unknown[] };
    void slideshowId;
    void overlayImageUrl;
    return { ...rest, design, qrPath: qr.url.replace(/[^/]+$/, ''), textCount: texts.length };
  };
  assert.deepEqual(strip(withLibrary.data[COLLECTIONS.SLIDESHOWS][0]), strip(plain.data[COLLECTIONS.SLIDESHOWS][0]), 'the window, the QR code, the texts and the settings do not depend on the background');
});

test('a stadium background that cannot be fetched is skipped: the built-in stage is drawn and no pick is stored', async () => {
  clearBrokenCache();
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], images: [stadium('a')] });
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  const result = await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(uploads), background: { fetchImage: async () => null } });
  assert.ok(result.ok && result.created);
  assert.deepEqual(uploads.map((upload) => upload.pathname), [await builtInStagePath(seeded)]);
  assert.equal((seeded.data[COLLECTIONS.EVENTS][0] as { stageBackground?: unknown }).stageBackground, undefined);
});

// ---- the QR text of the library (issue 326) ----

const qrRow = (qrTextId: string, text: string, language = 'en', extra: Record<string, unknown> = {}) => ({ qrTextId, text, language, isActive: true, createdAt: `2026-10-0${qrTextId.length}T00:00:00.000Z`, ...extra });
type Design = { texts: Array<{ text: string; x: number; y: number; width: number; size: number; align: string; fit?: boolean; color?: string }> };

test('an event that chooses nothing gets the default slideshow it always got while the library has no QR text: one line, the written address, and no pick stored', async () => {
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const result = await ensureDefaultSlideshow(seeded.db, EVENT, deps());
  assert.ok(result.ok && result.created);
  const design = seeded.data[COLLECTIONS.SLIDESHOWS][0].screenDesign as Design;
  assert.equal(design.texts.length, 1);
  assert.equal((seeded.data[COLLECTIONS.EVENTS][0] as { qrText?: unknown }).qrText, undefined);
  // The same event with texts in the library that are all switched off, or in another language only: still the same slideshow.
  const off = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan', 'en', { isActive: false }), qrRow('bb', 'Szkenneld!', 'hu')] });
  await ensureDefaultSlideshow(off.db, EVENT, deps());
  assert.equal((off.data[COLLECTIONS.SLIDESHOWS][0].screenDesign as Design).texts.length, 1, 'no active English text (a Hungarian one is not for an English event): no line');
  assert.equal((off.data[COLLECTIONS.EVENTS][0] as { qrText?: unknown }).qrText, undefined);
});

test('with a QR text in the library the new slideshow has one more line above the QR code, in its panel, scaled to the QR code\'s width, and the pick is stored on the event; the written address stays the first line', async () => {
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan & smile')] });
  const result = await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(), random: () => 0 });
  assert.ok(result.ok && result.created);
  const show = seeded.data[COLLECTIONS.SLIDESHOWS][0];
  const design = show.screenDesign as Design;
  assert.equal(design.texts.length, 2);
  assert.match(design.texts[0].text, /^go\.messmass\.com\//, 'the address is still the first line');
  assert.deepEqual({ ...design.texts[1], color: undefined }, { text: 'Scan & smile', x: DEFAULT_STAGE.qrText.x, y: DEFAULT_STAGE.qrText.y, width: DEFAULT_STAGE.qrText.width, size: DEFAULT_STAGE.qrText.size, align: 'center', fit: true, color: undefined });
  assert.equal(design.texts[1].color, design.texts[0].color, 'readable on the panel, like the address');
  assert.ok(parseScreenDesign(show.screenDesign).ok, 'the stored design passes the same check as an editor\'s');
  assert.deepEqual(seeded.data[COLLECTIONS.EVENTS][0].qrText, { qrTextId: 'a', pickedAt: '2026-10-09T10:00:00.000Z' });
});

test('a Hungarian event gets a Hungarian QR text, and an English one when there is none in Hungarian', async () => {
  const hungarian = { ...EVENT, uiLanguage: 'hu' };
  const both = fakeDb({ events: [hungarian], partners: [{ partnerId: 'p1', name: 'MTK' }], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan'), qrRow('bb', 'Szkenneld!', 'hu')] });
  await ensureDefaultSlideshow(both.db, hungarian, { ...deps(), random: () => 0 });
  assert.equal((both.data[COLLECTIONS.SLIDESHOWS][0].screenDesign as Design).texts[1].text, 'Szkenneld!');
  const englishOnly = fakeDb({ events: [hungarian], partners: [{ partnerId: 'p1', name: 'MTK' }], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan')] });
  await ensureDefaultSlideshow(englishOnly.db, hungarian, deps());
  assert.equal((englishOnly.data[COLLECTIONS.SLIDESHOWS][0].screenDesign as Design).texts[1].text, 'Scan');
});

test('the QR text is picked once: asking again for an event that has its default slideshow changes nothing and picks nothing', async () => {
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan'), qrRow('bb', 'Join')] });
  await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(), random: () => 0 });
  const before = JSON.stringify(seeded.data);
  const again = await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(), random: () => 0.99 });
  assert.ok(again.ok && !again.created);
  assert.equal(JSON.stringify(seeded.data), before);
});

test('with both libraries filled the new slideshow gets a stadium background and a QR text, and both picks are stored on the event', async () => {
  clearBrokenCache();
  const seeded = fakeDb({ events: [{ ...EVENT }], partners: [{ partnerId: 'p1', name: 'MTK' }], images: [stadium('a')], [COLLECTIONS.QR_TEXTS]: [qrRow('a', 'Scan & smile')] });
  const picture = await stadiumPicture();
  const result = await ensureDefaultSlideshow(seeded.db, EVENT, { ...deps(), random: () => 0, background: { fetchImage: async () => picture, random: () => 0 } });
  assert.ok(result.ok && result.created);
  const event = seeded.data[COLLECTIONS.EVENTS][0] as { stageBackground?: unknown; qrText?: unknown };
  assert.deepEqual(event.stageBackground, { pictureId: 'a', pickedAt: '2026-10-09T10:00:00.000Z' });
  assert.deepEqual(event.qrText, { qrTextId: 'a', pickedAt: '2026-10-09T10:00:00.000Z' });
  assert.equal((seeded.data[COLLECTIONS.SLIDESHOWS][0].screenDesign as Design).texts.length, 2);
});
