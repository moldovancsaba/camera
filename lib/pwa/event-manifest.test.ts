import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_PWA_BACKGROUND_COLOR } from '@/lib/gds/tokens/colors';
import { slideshowManifest, eventManifest, PWA_ICONS, pwaPageColor, pwaThemeColor } from './event-manifest';

const ID = '66f1a2b3c4d5e6f708192a3b';

test('the manifest opens and stays inside this event, not the origin root', () => {
  const m = eventManifest({ name: 'Summer Fest', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }, ID);

  assert.equal(m.start_url, `/capture/${ID}?source=pwa`);
  assert.equal(m.scope, `/capture/${ID}`);
  assert.equal(m.id, `/capture/${ID}`);
  assert.ok(m.start_url.startsWith(m.scope), 'start_url must be inside scope or the manifest is ignored');
  assert.equal(m.display, 'standalone');
});

test('both orientations are allowed', () => {
  assert.equal(eventManifest({ name: 'x' }, ID).orientation, 'any');
});

test('Chrome install criteria: 192 and 512 icons plus a maskable one', () => {
  const sizes = eventManifest({ name: 'x' }, ID).icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.deepEqual(sizes, ['192x192:any', '512x512:any', '512x512:maskable']);
});

test('name falls back and short_name is cut for the home screen label', () => {
  assert.equal(eventManifest({}, ID).name, 'Camera');
  assert.equal(eventManifest({ name: '   ' }, ID).short_name, 'Camera');
  const long = eventManifest({ name: 'The Very Long Festival Name 2026' }, ID);
  assert.equal(long.name, 'The Very Long Festival Name 2026');
  assert.equal(long.short_name, 'The Very Lon');
});

test('only a six digit hex brand colour becomes the theme colour', () => {
  assert.equal(pwaThemeColor(CAMERA_DEFAULT_CTA_BRAND_COLOR), CAMERA_DEFAULT_CTA_BRAND_COLOR);
  assert.equal(pwaThemeColor('red'), CAMERA_DEFAULT_BRAND_COLOR);
  assert.equal(pwaThemeColor('url(javascript:alert(1))'), CAMERA_DEFAULT_BRAND_COLOR);
  assert.equal(pwaThemeColor(undefined), CAMERA_DEFAULT_BRAND_COLOR);
});

test('the manifest equals what the GDS generator returns for the same input', async () => {
  // The generator is only imported here: in a route handler or layout its module fails the Next build.
  const { getGdsWebAppManifest } = await import('@sovereignsquad/gds-theme/server');

  assert.deepEqual(
    eventManifest({ name: 'Summer Fest', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }, ID),
    getGdsWebAppManifest({
      name: 'Summer Fest',
      shortName: 'Summer Fest',
      themeColor: CAMERA_DEFAULT_CTA_BRAND_COLOR,
      backgroundColor: CAMERA_PWA_BACKGROUND_COLOR,
      display: 'standalone',
      orientation: 'any',
      startUrl: `/capture/${ID}?source=pwa`,
      scope: `/capture/${ID}`,
      id: `/capture/${ID}`,
      icons: PWA_ICONS,
    })
  );
});

test('the installed app and the browser toolbar take the page colour of the event theme, else the brand colour and the default splash', () => {
  const theme = { background: CAMERA_DEFAULT_CTA_BRAND_COLOR };
  const themed = eventManifest({ name: 'Derby', brandColor: CAMERA_DEFAULT_BRAND_COLOR }, ID, theme);
  assert.equal(themed.theme_color, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  assert.equal(themed.background_color, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  const plain = eventManifest({ name: 'Derby', brandColor: CAMERA_DEFAULT_BRAND_COLOR }, ID);
  assert.equal(plain.theme_color, CAMERA_DEFAULT_BRAND_COLOR);
  assert.equal(plain.background_color, CAMERA_PWA_BACKGROUND_COLOR);
  assert.equal(pwaPageColor({ background: 'not a colour' }, CAMERA_DEFAULT_BRAND_COLOR), CAMERA_DEFAULT_BRAND_COLOR);
  assert.equal(pwaPageColor(null, undefined), CAMERA_DEFAULT_BRAND_COLOR);
});

test('a giant screen installs as its own full-screen app that opens that one slideshow, in the event\'s colours', () => {
  const m = slideshowManifest({ name: 'Main screen' }, { name: 'MTK x Vasas', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }, 'show-1', { background: `#${'189CD8'}` });
  assert.equal(m.display, 'fullscreen');
  assert.equal(m.start_url, '/slideshow/show-1?source=pwa');
  assert.equal(m.scope, '/slideshow/show-1');
  assert.equal(m.name, 'Main screen');
  assert.equal(m.theme_color, `#${'189CD8'}`);
  assert.equal(m.background_color, `#${'189CD8'}`);
  // with no theme: the brand colour and the default splash colour; with no slideshow name: the event's name
  const plain = slideshowManifest({}, { name: 'MTK x Vasas', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }, 'show-1');
  assert.equal(plain.name, 'MTK x Vasas');
  assert.equal(plain.theme_color, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  assert.equal(plain.background_color, CAMERA_PWA_BACKGROUND_COLOR);
});
