import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { parseScreenDesign } from './screen-design';
import { DEFAULT_STAGE } from '@/lib/screen/default-stage';
import { GIANT_SCREEN_PLACEMENT, QR_TEXT_KEYS, ensureDefaultSlideshow, findDefaultSlideshow, type DefaultSlideshowDeps } from './default-slideshow';
import { en } from '@/lib/i18n/messages.en';
import { hu } from '@/lib/i18n/messages.hu';

const EVENT = { _id: 'mongo-1', eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'p1', frameDesign: undefined as unknown };

function deps(uploads: Array<{ pathname: string; bytes: number }> = [], pick = 0): DefaultSlideshowDeps {
  return {
    upload: async (pathname, png) => {
      uploads.push({ pathname, bytes: png.length });
      return `https://blob.example/${pathname}`;
    },
    pickIndex: () => pick,
    origin: () => 'https://go.messmass.com',
    now: () => '2026-10-09T10:00:00.000Z',
  };
}

test('a new event gets a default slideshow: picture, tracked link, one call to action and the written address', async () => {
  const { db, data } = fakeDb({ events: [EVENT], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  const uploads: Array<{ pathname: string; bytes: number }> = [];
  const result = await ensureDefaultSlideshow(db, EVENT, deps(uploads, 2));
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
  const design = show.screenDesign as { qr: { url: string; x: number }; texts: Array<{ text: string; x: number; y: number }> };
  assert.equal(design.qr.url, `https://go.messmass.com/${links[0].slug}`);
  assert.equal(design.qr.x, DEFAULT_STAGE.qr.x);
  assert.equal(design.texts[0].text, en['screen.qrText.3'], 'the call to action is the one picked');
  assert.equal(design.texts[1].text, `go.messmass.com/${links[0].slug}`, 'the written address has no protocol');
  assert.equal(design.texts[0].x, DEFAULT_STAGE.ctaText.x);
  assert.ok(design.texts[0].y < design.texts[1].y, 'the call to action is the big text above the address, both under the photos');
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

test('a Hungarian event gets Hungarian texts', async () => {
  const event = { ...EVENT, uiLanguage: 'hu' };
  const { db, data } = fakeDb({ events: [event], partners: [{ partnerId: 'p1', name: 'MTK' }] });
  await ensureDefaultSlideshow(db, event, deps([], 0));
  const show = data.slideshows[0] as { name: string; screenDesign: { texts: Array<{ text: string }> } };
  assert.equal(show.name, hu['screen.slideshow.name']);
  assert.equal(show.screenDesign.texts[0].text, hu['screen.qrText.1']);
});

test('every call to action and a typical written address fit on one line of the band under the photos, in both languages', () => {
  // Bold text at the stage's size is about 0.6 of its size wide per character; the band is 69.274% of the width, the size 7.2% of the height of a 16:9 stage.
  const maxCharacters = Math.floor((DEFAULT_STAGE.ctaText.width / 100) * 1920 / (0.6 * (DEFAULT_STAGE.ctaText.size / 100) * 1080));
  for (const key of QR_TEXT_KEYS) {
    assert.ok(en[key as keyof typeof en].length <= maxCharacters, `${key} (en) is too long for the band`);
    assert.ok(hu[key as keyof typeof hu].length <= maxCharacters, `${key} (hu) is too long for the band`);
  }
  for (const address of ['go.messmass.com/abcdef', 'go.messmass.com/mtk-vasas']) assert.ok(address.length <= maxCharacters, `${address} is too long for the band`);
});
