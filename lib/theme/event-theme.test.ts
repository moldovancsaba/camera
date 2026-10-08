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
      partner: { name: 'Aquatics', logoUrl: 'https://i.ibb.co/logo.png' },
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
  assert.equal(theme.logoUrl, 'https://i.ibb.co/logo.png');
  assert.equal(theme.emoji, null, 'a logo, so no emoji');
  assert.deepEqual(theme.font, { family: 'Aquatic', source: 'system', file: null, url: null });
});

test('a style that cannot be read is corrected: text, card text and button text always pass', () => {
  const bad = { heroBackground: '#ffffffff', headingColor: '#fafafaff', page: { ...PAGE, cardBackground: '#ffffffff', textColor: '#f0f0f0ff', buttonBackground: '#ffffffff', buttonText: '#ffffffff', accentColor: '#fefefeff' } };
  const theme = resolveEventTheme({ context: context(bad), brandColor: '#0057b8' });
  assert.ok(contrast(theme.heading, theme.background) >= 4.5, 'heading');
  assert.ok(contrast(theme.cardText, theme.cardBackground) >= 4.5, 'card text');
  assert.ok(contrast(theme.buttonText, theme.buttonBackground) >= 3, 'button text');
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3, 'the button stands out from its card');
  assert.ok(contrast(theme.buttonBackground, theme.background) >= 3, 'and from the page');
  assert.equal(theme.buttonBackground, '#0057b8', 'the event brand colour follows the style button, its accent and the page colour');
});

test('the system default style gives a light page with a readable button', () => {
  const theme = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'Club', partnerLogoUrl: null }, NOW) });
  assert.equal(theme.source, 'default');
  assert.equal(theme.dark, false);
  assert.ok(contrast(theme.heading, theme.background) >= 4.5);
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3, 'the default white button is replaced by the accent');
});

test('with no snapshot at all the system default look is used, with the brand colour on the buttons', () => {
  const none = resolveEventTheme({});
  assert.equal(none.source, 'default');
  assert.equal(none.logoUrl, null);
  const branded = resolveEventTheme({ brandColor: '#9333ea' });
  assert.equal(branded.source, 'event');
  assert.ok(contrast(branded.buttonBackground, branded.cardBackground) >= 3);
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

test('a snapshot taken before page colours existed still themes the page from its hero and heading colours', () => {
  const theme = resolveEventTheme({ context: context({}) });
  assert.equal(theme.background, '#171d37');
  assert.equal(theme.heading, '#ffffff');
  assert.ok(contrast(theme.cardText, theme.cardBackground) >= 4.5);
});

test('a button must stand out from the page as well as from the card: on a dark page a dark button is not used', () => {
  const theme = resolveEventTheme({ context: context({ page: { ...PAGE, buttonBackground: '#171d37ff', accentColor: '#171d37ff' } }), brandColor: '#3b82f6' });
  assert.ok(contrast(theme.buttonBackground, theme.background) >= 3, `button ${theme.buttonBackground} on page ${theme.background}`);
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3);
  assert.equal(theme.buttonBackground, '#3b82f6');
});

test('a style colour that does not stand out is repaired, keeping its hue: grey on grey becomes a darker grey, not black', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#808080ff', page: { ...PAGE, cardBackground: '#808080ff', buttonBackground: '#808080ff', accentColor: '#808080ff' } }) });
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3 && contrast(theme.buttonBackground, theme.background) >= 3);
});

test('when no variant of any colour stands out from both card and page, the best of the card text, black and white is used', () => {
  // A light card on a dark page: no shade can be 3:1 from both, so the last resort applies.
  const theme = resolveEventTheme({ context: context({ heroBackground: '#3a3a3aff', page: { ...PAGE, cardBackground: '#d0d0d0ff', buttonBackground: '#808080ff', accentColor: '#808080ff', textColor: '#111111ff' } }) });
  assert.ok(['#000000', '#ffffff'].includes(theme.buttonBackground) || theme.buttonBackground === theme.cardText);
});

test('MTK x Vasas (camera#336): the navy text on the page blue is made 20% darker, keeping the hue, not replaced by black', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff', buttonBackground: '#ffffffff', buttonText: '#00b5e4ff', accentColor: '#00b5e4ff' } }) });
  assert.equal(theme.heading, '#003d6c');
  assert.ok(contrast(theme.heading, theme.background) >= 4.5);
  assert.equal(theme.cardText, '#004c87', 'on the card the navy already reads');
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
  assert.equal(noRing.buttonRing, noRing.buttonText, 'with no ring colour anywhere the ring is the label colour');
});

test('an event colour that does not stand out is repaired, keeping its hue, and its label is white or black by contrast', () => {
  const theme = resolveEventTheme({ context: context({ heroBackground: '#f8fafcff', page: { ...PAGE, cardBackground: '#ffffffff' } }), brandColor: '#d8e0ff' });
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3 && contrast(theme.buttonBackground, theme.background) >= 3);
  const [r, , b] = [1, 3, 5].map((i) => parseInt(theme.buttonBackground.slice(i, i + 2), 16));
  assert.ok(b > r, 'still bluish');
  assert.ok(['#ffffff', '#000000'].includes(theme.buttonText));
  assert.ok(contrast(theme.buttonText, theme.buttonBackground) >= 3);
});

test('dimmed text and the edge of an input read as well as the text: 4.5:1 and 3:1, on every kind of style', () => {
  const styles = [
    context({ page: PAGE }),
    context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff' } }),
    context({ heroBackground: '#ffffffff', headingColor: '#fafafaff', page: { ...PAGE, textColor: '#f0f0f0ff' } }),
    nativeFrameContext({ eventName: 'Derby', partnerName: null, partnerLogoUrl: null }, NOW),
  ];
  for (const ctx of styles) {
    const theme = resolveEventTheme({ context: ctx });
    assert.ok(contrast(theme.headingMuted, theme.background) >= 4.5, `dimmed text ${theme.headingMuted} on page ${theme.background}`);
    assert.ok(contrast(theme.cardMuted, theme.cardBackground) >= 4.5, `dimmed text ${theme.cardMuted} on card ${theme.cardBackground}`);
    assert.ok(contrast(theme.inputBorder, theme.cardBackground) >= 3, `input edge ${theme.inputBorder} on card ${theme.cardBackground}`);
  }
});

test('a logo on a host the pages may not load images from is not used: the emoji takes its place', () => {
  const ctx = parseFrameContext({ event: { name: '🏐 Hungary x Denmark' }, partner: { name: 'MRSZ', logoUrl: 'https://elsewhere.test/logo.png' }, template: null, style: { headingColor: '#1f2937ff', heroBackground: '#f8fafcff' } }, NOW)!;
  const theme = resolveEventTheme({ context: ctx });
  assert.equal(theme.logoUrl, null);
  assert.equal(theme.emoji, '🏐');
  assert.equal(allowedImage('https://i.ibb.co/x/logo.png'), 'https://i.ibb.co/x/logo.png');
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
  assert.equal(noRing.buttonRing, '#ffffff');
  // a label that cannot be read on its fill is corrected; text that is not a colour is ignored
  const unreadable = resolveEventTheme({ context, buttons: { fill: '#1b3a69', label: '#223344' } });
  assert.ok(contrast(unreadable.buttonText, unreadable.buttonBackground) >= 3);
  const junk = resolveEventTheme({ context, buttons: { fill: 'red; background:url(x)', label: 42, ring: {} } });
  assert.deepEqual([junk.buttonBackground, junk.buttonText, junk.buttonRing], [base.buttonBackground, base.buttonText, base.buttonRing]);
});


test('the link colour reads on the card and on a ticked, tinted card (the consent boxes)', () => {
  for (const ctx of [context({ page: PAGE }), context({ heroBackground: '#00b5e4ff', headingColor: '#004c87ff', page: { ...PAGE, cardBackground: '#f3f4f6ff', textColor: '#004c87ff', linkColor: '#2563ebff' } })]) {
    const theme = resolveEventTheme({ context: ctx });
    const ticked = mix(theme.buttonBackground, theme.cardBackground, SELECTED_TINT);
    assert.ok(contrast(theme.link, theme.cardBackground) >= 4.5, `link ${theme.link} on the card`);
    assert.ok(contrast(theme.link, ticked) >= 4.5, `link ${theme.link} on the ticked card ${ticked}`);
  }
});
