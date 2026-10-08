import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT_THEME_CSS, fontFaceCss, fontStack, googleFontHref, pageColourCss, safeFontFamily, SYSTEM_FONT_STACK, themeVariables } from './css';
import { resolveEventTheme } from './event-theme';

test('a theme becomes the custom properties of its wrapper', () => {
  const theme = resolveEventTheme({});
  const vars = themeVariables(theme);
  assert.deepEqual(Object.keys(vars).sort(), ['--event-bg', '--event-button-bg', '--event-button-ring', '--event-button-text', '--event-card-bg', '--event-card-border', '--event-card-text', '--event-font', '--event-heading', '--event-link', '--event-radius']);
  assert.equal(vars['--event-bg'], theme.background);
  assert.equal(vars['--event-radius'], theme.radius);
});

test('a font family is cleaned so it cannot break out of the font stack', () => {
  assert.equal(safeFontFamily('Aquatic'), 'Aquatic');
  const cleaned = safeFontFamily("Evil'; background:url(x) }") ?? '';
  assert.equal(/['";:(){}]/.test(cleaned), false, `no quote, semicolon, colon, bracket or brace is left: ${cleaned}`);
  assert.ok(cleaned.startsWith('Evil'));
  assert.equal(safeFontFamily('{}();:'), null);
  assert.equal(fontStack({ font: { family: '{}', source: 'system', file: null, url: null } }), SYSTEM_FONT_STACK);
  assert.match(fontStack({ font: { family: 'Inter', source: 'google', file: null, url: null } }), /^'Inter', system-ui/);
});

test('the rules carry no colour literal: every colour is a variable the wrapper sets', () => {
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(EVENT_THEME_CSS), false);
  assert.equal(/rgba?\(/i.test(EVENT_THEME_CSS), false);
  for (const name of ['--event-bg', '--event-card-bg', '--event-button-bg', '--event-button-text', '--event-heading']) assert.ok(EVENT_THEME_CSS.includes(`var(${name})`), name);
});

test('a Google font is loaded by its stylesheet, only for a plain family name', () => {
  assert.equal(googleFontHref('Open Sans'), 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  assert.equal(googleFontHref('{}'), null);
  assert.ok(!googleFontHref("Evil';}")?.includes("'"));
});

test('a custom font becomes an @font-face for an https font file, nothing else', () => {
  assert.equal(
    fontFaceCss('AS Roma', 'https://www.messmass.com/fonts/ASRoma-Regular.woff'),
    "@font-face { font-family: 'AS Roma'; src: url('https://www.messmass.com/fonts/ASRoma-Regular.woff') format('woff'); font-display: swap; }"
  );
  assert.equal(fontFaceCss('X', 'https://www.messmass.com/fonts/a.woff2')?.includes("format('woff2')"), true);
  for (const bad of [null, 'http://www.messmass.com/fonts/a.woff', 'https://www.messmass.com/fonts/a.exe', "https://x.test/a'b.woff", 'not a url']) assert.equal(fontFaceCss('X', bad), null, String(bad));
  assert.equal(fontFaceCss('{}', 'https://www.messmass.com/fonts/a.woff'), null);
});

test('the page colour reaches the document and the GDS wrapper behind the page, and only as a hex colour', () => {
  const css = pageColourCss(resolveEventTheme({}).background);
  assert.match(css, /^html:root\[data-mantine-color-scheme\] \{ --mantine-color-body: #[0-9a-f]{6}; background: #[0-9a-f]{6}; \}$/i);
  assert.equal(pageColourCss('red; } body { display: none'), '');
  assert.equal(pageColourCss('url(https://example.com/x)'), '');
});

test('every button of the flow is the Start design: a pill with a ring and bold capitals; the quieter button is the same design inverted', () => {
  const rule = (selector: string) => EVENT_THEME_CSS.slice(EVENT_THEME_CSS.indexOf(selector));
  assert.match(EVENT_THEME_CSS, /\.event-theme \.mantine-Button-root \{[^}]*--button-radius: 999px !important;[^}]*text-transform: uppercase !important;/);
  const main = rule(".event-theme .mantine-Button-root:not([data-variant]),");
  assert.match(main, /--button-bg: var\(--event-button-bg\) !important;[\s\S]*--button-color: var\(--event-button-text\) !important;[\s\S]*--button-bd: var\(--ring\) solid var\(--event-button-ring\) !important;/);
  const inverse = rule(".event-theme .mantine-Button-root[data-variant='light'],");
  assert.match(inverse, /--button-bg: var\(--event-button-text\) !important;[\s\S]*--button-color: var\(--event-button-bg\) !important;[\s\S]*--button-bd: var\(--ring\) solid var\(--event-button-ring\) !important;/);
  for (const variant of ['light', 'default', 'outline']) assert.ok(EVENT_THEME_CSS.includes(`[data-variant='${variant}']`), variant);
  assert.equal(/mantine-Paper-root \.mantine-Button-root/.test(EVENT_THEME_CSS), false, 'no older card-only button colours that would undo the inverted design');
});

test('a ticked checkbox takes the event\'s button colours, not the default purple', () => {
  assert.match(EVENT_THEME_CSS, /\.event-theme \.mantine-Checkbox-root \{\s*--checkbox-color: var\(--event-button-bg\) !important;\s*--checkbox-icon-color: var\(--event-button-text\) !important;/);
});

