import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameContext } from '@/lib/frame/context';
import { nativeFrameContext, parseFrameContext } from '@/lib/frame/context';
import { contrast } from './color';
import { resolveEventTheme } from './event-theme';

const NOW = '2026-10-06T12:00:00.000Z';

// A messmass answer in the shape camera parses; the colours are the ones of a real project style (European Aquatics) and the system default.
function context(style: Record<string, unknown>, extra: Record<string, unknown> = {}): FrameContext {
  const parsed = parseFrameContext(
    {
      event: { name: 'European Aquatics Championships 2026 Paris', date: null, homeTeam: null, visitorTeam: null },
      partner: { name: 'Aquatics', logoUrl: 'https://store.test/logo.png' },
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
  assert.equal(theme.logoUrl, 'https://store.test/logo.png');
  assert.equal(theme.emoji, null, 'a logo, so no emoji');
  assert.deepEqual(theme.font, { family: 'Aquatic', source: 'system', file: null });
});

test('a style that cannot be read is corrected: text, card text and button text always pass', () => {
  const bad = { heroBackground: '#ffffffff', headingColor: '#fafafaff', page: { ...PAGE, cardBackground: '#ffffffff', textColor: '#f0f0f0ff', buttonBackground: '#ffffffff', buttonText: '#ffffffff', accentColor: '#fefefeff' } };
  const theme = resolveEventTheme({ context: context(bad), brandColor: '#0057b8' });
  assert.ok(contrast(theme.heading, theme.background) >= 4.5, 'heading');
  assert.ok(contrast(theme.cardText, theme.cardBackground) >= 4.5, 'card text');
  assert.ok(contrast(theme.buttonText, theme.buttonBackground) >= 3, 'button text');
  assert.ok(contrast(theme.buttonBackground, theme.cardBackground) >= 3, 'the button stands out from its card');
  assert.equal(theme.buttonBackground, '#0057b8', 'the event brand colour is the next candidate after the style button and accent');
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
