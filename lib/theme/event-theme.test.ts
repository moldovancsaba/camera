import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameContext } from '@/lib/frame/context';
import { nativeFrameContext, parseFrameContext } from '@/lib/frame/context';
import { contrast } from './color';
import { allowedImage, resolveEventTheme, SELECTED_TINT } from './event-theme';
import { mix } from './color';

const NOW = '2026-10-06T12:00:00.000Z';

// A messmass answer in the shape camera parses; the colours are the ones of a real project style (European Aquatics) and the system default.
function context(style: Record<string, unknown>, extra: Record<string, unknown> = {}): FrameContext {
  const parsed = parseFrameContext(
    {
      event: { name: 'European Aquatics Championships 2026 Paris', date: null, homeTeam: null, visitorTeam: null },
      partner: { name: 'Aquatics', logoUrl: 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/aquatics.png' },
      template: null,
      style: { name: 'S', resolvedFrom: 'project', fontFamily: 'Aquatic', fontSource: 'system', fontFile: null, headingColor: '#ffffffff', heroBackground: '#171d37ff', ...style },
      ...extra,
    },
    NOW
  );
  assert.ok(parsed);
  return parsed;
}

const PAGE = { pageBackground: '#171d37ff', textColor: '#111827ff', cardBackground: '#ffffffff', cardBorder: '#e5e7ebff', buttonBackground: '#3b82f6ff', buttonText: '#ffffffff', accentColor: '#3b82f6ff', linkColor: '#2563ebff', cardRadius: '1rem' };

test('the pages take the background, heading, card, button and radius of the messmass style, and its font and logo', () => {
  const theme = resolveEventTheme({ context: context({ page: PAGE }) });
  assert.equal(theme.source, 'messmass');
  assert.equal(theme.background, '#171d37');
  assert.equal(theme.heading, '#ffffff');
  assert.equal(theme.dark, true);
  assert.equal(theme.cardBackground, '#ffffff');
  assert.equal(theme.cardText, '#111827');
  assert.equal(theme.buttonBackground, '#3b82f6');
  assert.equal(theme.buttonText, '#ffffff');
  assert.equal(theme.radius, '1rem');
  assert.equal(theme.logoUrl, 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/aquatics.png');
  assert.equal(theme.emoji, null, 'a logo, so no emoji');
  assert.deepEqual(theme.font, { family: 'Aquatic', source: 'system', file: null, url: null });
});

test('configured Messmass and Camera colors are preserved and low contrast is reported instead of corrected', () => {
  const bad = { heroBackground: '#ffffffff', headingColor: '#fafafaff', page: { ...PAGE, cardBackground: '#ffffffff', textColor: '#f0f0f0ff', buttonBackground: '#ffffffff', buttonText: '#ffffffff', accentColor: '#fefefeff' } };
  const theme = resolveEventTheme({ context: context(bad), brandColor: '#0057b8' });
  assert.equal(theme.heading, '#fafafa');
  assert.equal(theme.cardText, '#f0f0f0');
  assert.equal(theme.buttonBackground, '#0057b8', 'the Camera event override is preserved');
  assert.equal(theme.buttonText, '#ffffff', 'the configured label is preserved');
  assert.ok(theme.contrastWarnings.length > 0);
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Page heading on page background')));
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Card text on card background')));
});

test('the system default style keeps its configured colors and reports any contrast issue', () => {
  const theme = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'Club', partnerLogoUrl: null }, NOW) });
  assert.equal(theme.source, 'default');
  assert.equal(theme.dark, false);
  assert.ok(contrast(theme.heading, theme.background) >= 4.5);
  assert.equal(theme.buttonBackground, '#ffffff');
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Button fill against card background')));
});

test('with no snapshot at all the system default look is used, with the brand colour on the buttons', () => {
  const none = resolveEventTheme({});
  assert.equal(none.source, 'default');
  assert.equal(none.logoUrl, null);
  const branded = resolveEventTheme({ brandColor: '#9333ea' });
  assert.equal(branded.source, 'event');
  assert.equal(branded.buttonBackground, '#9333ea', 'the configured event color is used exactly');
});

test('an event without a logo falls back to its emoji', () => {
  const ctx = parseFrameContext({ event: { name: '🏀 Hungary x Iceland', homeTeam: null, visitorTeam: null }, partner: { name: 'MKOSZ', logoUrl: null }, template: null, style: { headingColor: '#1f2937ff', heroBackground: '#f8fafcff' } }, NOW)!;
  const theme = resolveEventTheme({ context: ctx });
  assert.equal(theme.logoUrl, null);
  assert.equal(theme.emoji, '🏀');
});

test('transparent colours are flattened and a huge or odd radius is limited', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#17203700', page: { ...PAGE, cardRadius: '3rem' } }) });
  assert.equal(theme.background, '#ffffff', 'a fully transparent background is the page white');
  assert.equal(theme.radius, '2rem');
  assert.equal(resolveEventTheme({ context: context({ page: { ...PAGE, cardRadius: 'calc(1px)' } }) }).radius, '0.75rem');
});

test('a snapshot taken before page colours existed still uses its hero and heading colors without correction', () => {
  const theme = resolveEventTheme({ context: context({}) });
  assert.equal(theme.background, '#171d37');
  assert.equal(theme.heading, '#ffffff');
  assert.equal(theme.cardText, '#111827');
});

test('an event button color is preserved even when it does not stand out from its configured surfaces', () => {
  const theme = resolveEventTheme({ context: context({ page: { ...PAGE, buttonBackground: '#171d37ff', accentColor: '#171d37ff' } }), brandColor: '#171d37' });
  assert.equal(theme.buttonBackground, '#171d37');
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Button fill against page background')));
});

test('a style fill that does not stand out is preserved and produces a contrast warning', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#808080ff', page: { ...PAGE, cardBackground: '#808080ff', buttonBackground: '#808080ff', accentColor: '#808080ff' } }) });
  assert.equal(theme.buttonBackground, '#808080');
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Button fill against card background')));
});

test('a difficult palette is not replaced by a fallback color', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#3a3a3aff', page: { ...PAGE, cardBackground: '#d0d0d0ff', buttonBackground: '#808080ff', accentColor: '#808080ff', textColor: '#111111ff' } }) });
  assert.equal(theme.buttonBackground, '#808080');
  assert.equal(theme.controlAccent, '#808080');
  assert.ok(theme.contrastWarnings.length > 0);
});

test('MTK x Vasas keeps every configured Messmass color and reports the cyan button-label contrast', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff', buttonBackground: '#ffffffff', buttonText: '#00b5e4ff', accentColor: '#00b5e4ff' } }) });
  assert.equal(theme.heading, '#004c87');
  assert.equal(theme.cardText, '#004c87');
  assert.equal(theme.buttonBackground, '#ffffff');
  assert.equal(theme.buttonText, '#00b5e4');
  assert.equal(theme.buttonRing, '#00b5e4');
  assert.equal(theme.controlAccent, '#00b5e4');
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Button text on button fill')));
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Selected-control mark on selected-control color')));
});

test('button colours: the welcome page first, then the event\'s own colours, then the ones derived from the style', () => {
  const ctx = context({ page: PAGE });
  const derived = resolveEventTheme({ context: ctx });
  const event = resolveEventTheme({ context: ctx, brandColor: '#0a7d3e', brandBorderColor: '#b45309' });
  assert.equal(event.buttonBackground, '#0a7d3e', 'the event colour wins over the style button');
  assert.equal(event.buttonRing, '#b45309', 'and its ring colour is the ring');
  assert.notEqual(derived.buttonBackground, '#0a7d3e');
  const welcome = resolveEventTheme({ context: ctx, brandColor: '#0a7d3e', brandBorderColor: '#b45309', buttons: { fill: '#1b3a69', label: '#ffffff', ring: '#189cd8' } });
  assert.deepEqual([welcome.buttonBackground, welcome.buttonText, welcome.buttonRing], ['#1b3a69', '#ffffff', '#189cd8'], 'the welcome page wins over the event');
  const noRing = resolveEventTheme({ context: ctx, brandColor: '#0a7d3e' });
  assert.equal(noRing.buttonRing, '#3b82f6', 'with no explicit Camera ring, use the configured Messmass accent');
});

test('an event color and configured label are preserved even when contrast is low', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#f8fafcff', page: { ...PAGE, cardBackground: '#ffffffff' } }), brandColor: '#d8e0ff' });
  assert.equal(theme.buttonBackground, '#d8e0ff');
  assert.equal(theme.buttonText, '#ffffff');
  assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Button text on button fill')));
});

test('secondary text and input edges reuse the configured Messmass text and border colors', () => {
  const styles = [
    context({ page: PAGE }),
    context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff' } }),
    context({ heroBackground: '#ffffffff', headingColor: '#fafafaff', page: { ...PAGE, textColor: '#f0f0f0ff' } }),
    nativeFrameContext({ eventName: 'Derby', partnerName: null, partnerLogoUrl: null }, NOW),
  ];
  for (const ctx of styles) {
    const theme = resolveEventTheme({ context: ctx });
    assert.equal(theme.headingMuted, theme.heading);
    assert.equal(theme.cardMuted, theme.cardText);
    assert.equal(theme.inputBorder, theme.cardBorder);
  }
});

test('a logo on a host the pages may not load images from is not used: the emoji takes its place', () => {
  const ctx = parseFrameContext({ event: { name: '🏐 Hungary x Denmark' }, partner: { name: 'MRSZ', logoUrl: 'https://elsewhere.test/logo.png' }, template: null, style: { headingColor: '#1f2937ff', heroBackground: '#f8fafcff' } }, NOW)!;
  const theme = resolveEventTheme({ context: ctx });
  assert.equal(theme.logoUrl, null);
  assert.equal(theme.emoji, '🏐');
  assert.equal(allowedImage('https://i.ibb.co/x/logo.png'), null, 'ImgBB is a backup host, never a guest-facing image source');
  assert.equal(allowedImage('https://imgbb.com/x/logo.png'), null, 'ImgBB pages are not image sources either');
  assert.equal(allowedImage('https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/a.png'), 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/a.png');
  assert.equal(allowedImage(`https://pub-${'0'.repeat(32)}.r2.dev/logos/a.png`), null, 'only the logo bucket, not any r2.dev address');
  assert.equal(allowedImage('https://abc123.public.blob.vercel-storage.com/logo.png') !== null, true);
  assert.equal(allowedImage('http://i.ibb.co/x.png'), null);
  assert.equal(allowedImage('https://evil.test/i.ibb.co/x.png'), null);
  assert.equal(allowedImage(null), null);
});

test('the colours the club set on its welcome page Start button become the buttons of the whole flow, and the ring defaults to the label colour', () => {
  const context = nativeFrameContext({ eventName: 'Fan Day', partnerName: null, partnerLogoUrl: null }, '2026-10-07T10:00:00.000Z');
  const base = resolveEventTheme({ context });
  assert.equal(base.buttonRing, base.buttonText, 'with no welcome colours the ring is the label colour');
  const own = resolveEventTheme({ context, buttons: { fill: '#1b3a69', label: '#ffffff', ring: '#189cd8' } });
  assert.deepEqual([own.buttonBackground, own.buttonText, own.buttonRing], ['#1b3a69', '#ffffff', '#189cd8']);
  const noRing = resolveEventTheme({ context, buttons: { fill: '#1b3a69', label: '#ffffff' } });
  assert.equal(noRing.buttonRing, '#3b82f6', 'with no explicit welcome ring, use the configured Messmass accent');
  // even an unreadable configured label stays exactly as entered; malformed values are ignored
  const unreadable = resolveEventTheme({ context, buttons: { fill: '#1b3a69', label: '#223344' } });
  assert.equal(unreadable.buttonText, '#223344');
  assert.ok(unreadable.contrastWarnings.some((warning) => warning.startsWith('Button text on button fill')));
  const junk = resolveEventTheme({ context, buttons: { fill: 'red; background:url(x)', label: 42, ring: {} } });
  assert.deepEqual([junk.buttonBackground, junk.buttonText, junk.buttonRing], [base.buttonBackground, base.buttonText, base.buttonRing]);
});


test('the configured link color is preserved and low contrast on a selected card is reported', () => {
  for (const ctx of [context({ page: PAGE }), context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff', linkColor: '#2563ebff' } })]) {
    const theme = resolveEventTheme({ context: ctx });
    const ticked = mix(theme.controlAccent, theme.cardBackground, SELECTED_TINT);
    assert.equal(theme.link, '#2563eb');
    if (contrast(theme.link, theme.cardBackground) < 4.5) {
      assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Link on card background')));
    }
    if (contrast(theme.link, ticked) < 4.5) {
      assert.ok(theme.contrastWarnings.some((warning) => warning.startsWith('Link on selected card background')));
    }
  }
});

test('the theme says where the button fill comes from, in the order the colours apply: the welcome page, the event own colour, the messmass style, the default', () => {
  const messmass = context({ page: PAGE });
  const darkWelcome = { fill: '#1b3a69', label: '#ffffff', ring: '#189cd8' };
  const welcome = resolveEventTheme({ context: messmass, brandColor: '#0057b8', buttons: darkWelcome });
  assert.equal(welcome.buttonSource, 'welcome');
  assert.equal(welcome.buttonBackground, '#1b3a69');

  const own = resolveEventTheme({ context: messmass, brandColor: '#0057b8' });
  assert.equal(own.buttonSource, 'event');
  assert.notEqual(own.buttonBackground, '#3b82f6', 'the event colour (made to stand out from the card and the page, same hue), not the style button');

  const fromMessmass = resolveEventTheme({ context: messmass });
  assert.equal(fromMessmass.buttonSource, 'messmass');
  assert.equal(fromMessmass.buttonBackground, '#3b82f6', 'the style of the report, as it is');

  const none = resolveEventTheme({});
  assert.equal(none.buttonSource, 'default');
  const native = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Fan day', partnerName: 'Club', partnerLogoUrl: null }, NOW) });
  assert.equal(native.buttonSource, 'default', 'camera own fallback is not messmass');
});

test('clearing the own colour of an event gives the guests the messmass colours back', () => {
  const messmass = context({ page: PAGE });
  const withOwn = resolveEventTheme({ context: messmass, brandColor: '#831100', brandBorderColor: '#ffaa00' });
  const cleared = resolveEventTheme({ context: messmass, brandColor: null, brandBorderColor: null });
  assert.notEqual(withOwn.buttonBackground, cleared.buttonBackground);
  assert.equal(cleared.buttonBackground, resolveEventTheme({ context: messmass }).buttonBackground);
  assert.equal(cleared.source, 'messmass');
});
