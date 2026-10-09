import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { parseScreenDesign } from './screen-design';
import { DEFAULT_STAGE } from '@/lib/screen/default-stage';
import { GIANT_SCREEN_PLACEMENT, ensureDefaultSlideshow, findDefaultSlideshow, writtenAddress, type DefaultSlideshowDeps } from './default-slideshow';
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
