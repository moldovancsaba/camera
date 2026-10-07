/**
 * The event theme as CSS (camera#285): the custom properties a themed page sets on its wrapper, and the rules that carry them onto the
 * Mantine and GDS components inside it (cards, buttons, text, links). No colour literal lives here: every colour is a variable the wrapper
 * sets from the resolved theme, so the GDS colour gate stays green and the components stay the existing ones.
 * Pure; unit-tested in css.test.ts.
 */

import type { EventTheme } from '@/lib/theme/event-theme';

/** A font family name safe to put in a CSS font stack: letters, digits, spaces and hyphens only; anything else is dropped. */
export function safeFontFamily(family: string): string | null {
  const clean = family.replace(/[^A-Za-z0-9 \-]/g, '').trim();
  return clean ? clean : null;
}

export const SYSTEM_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** The Google Fonts stylesheet of a family (regular, semibold, bold), or null when the name is not a plain family name. */
export function googleFontHref(family: string): string | null {
  const clean = safeFontFamily(family);
  return clean ? `https://fonts.googleapis.com/css2?family=${clean.replace(/ /g, '+')}:wght@400;600;700&display=swap` : null;
}

const FONT_FORMATS: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/** The @font-face of a custom font file on the messmass origin; null for anything but an https font file with a known extension. */
export function fontFaceCss(family: string, url: string | null): string | null {
  const clean = safeFontFamily(family);
  if (!clean || !url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const format = FONT_FORMATS[parsed.pathname.split('.').pop()?.toLowerCase() ?? ''];
  if (parsed.protocol !== 'https:' || !format || /["'()\\\s]/.test(parsed.href)) return null;
  return `@font-face { font-family: '${clean}'; src: url('${parsed.href}') format('${format}'); font-display: swap; }`;
}

/** The font stack of the theme: its own family first (when it is a loaded or installed font), then the system stack. */
export function fontStack(theme: Pick<EventTheme, 'font'>): string {
  const family = safeFontFamily(theme.font.family);
  return family ? `'${family}', ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK;
}

/** The custom properties of a theme, to set as an element's `style`. */
export function themeVariables(theme: EventTheme): Record<string, string> {
  return {
    '--event-bg': theme.background,
    '--event-heading': theme.heading,
    '--event-card-bg': theme.cardBackground,
    '--event-card-text': theme.cardText,
    '--event-card-border': theme.cardBorder,
    '--event-button-bg': theme.buttonBackground,
    '--event-button-text': theme.buttonText,
    '--event-button-ring': theme.buttonRing,
    '--event-link': theme.link,
    '--event-radius': theme.radius,
    '--event-font': fontStack(theme),
  };
}

/**
 * The page colour behind everything, for the part of the screen the page box does not reach (camera#316). The GDS provider wraps the app in a
 * full-height div painted with Mantine's body colour (white), over the document's own background; on a phone with a floating bottom bar (iOS 26
 * Safari) the page box ends above the bar while that wrapper reaches below it, and a white band showed under the picture (owner, 2026-10-07).
 * So the document and Mantine's body colour take the page colour of the event, the way the messmass report does. A value that is not a hex colour
 * gives no rule.
 */
export function pageColourCss(background: string): string {
  return /^#[0-9a-f]{6}$/i.test(background)
    ? `html:root[data-mantine-color-scheme] { --mantine-color-body: ${background}; background: ${background}; }`
    : '';
}

/**
 * The rules that apply the variables to what is inside a `.event-theme` wrapper. Cards (Mantine Paper, which the GDS flow shell is) get
 * the card colours and the radius; filled buttons the button colours; text outside cards the heading colour on the page background.
 */
export const EVENT_THEME_CSS = `
.event-theme {
  background: var(--event-bg);
  color: var(--event-heading);
  font-family: var(--event-font);
  color-scheme: normal;
}
.event-theme .mantine-Paper-root,
.event-theme [data-event-card] {
  --mantine-color-body: var(--event-card-bg);
  --mantine-color-text: var(--event-card-text);
  --mantine-color-dimmed: color-mix(in srgb, var(--event-card-text) 62%, var(--event-card-bg));
  --mantine-color-default-border: var(--event-card-border);
  background: var(--event-card-bg);
  color: var(--event-card-text);
  border-color: var(--event-card-border);
  border-radius: var(--event-radius);
}
.event-theme .mantine-Paper-root a:not(.mantine-Button-root),
.event-theme [data-event-card] a:not(.mantine-Button-root) {
  color: var(--event-link);
}
.event-theme {
  --mantine-font-family: var(--event-font);
  --mantine-font-family-headings: var(--event-font);
  --mantine-primary-color-filled: var(--event-button-bg);
  --mantine-primary-color-filled-hover: color-mix(in srgb, var(--event-button-bg) 86%, var(--event-button-text));
}
.event-theme .mantine-Button-root {
  /* The Start button of the welcome page is the button of the whole flow (item 59 of the welcome page planning): a round pill with a ring, bold capitals and a soft glow. */
  --ring: 4px;
  --button-radius: 999px !important;
  height: auto;
  min-height: var(--button-height, 2.625rem);
  padding-block: 0.375rem;
  font-weight: 800 !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
}
/* The small buttons (two side by side, Google and Facebook) get a thinner ring, less padding and tighter letters so the capitals fit. */
.event-theme .mantine-Button-root[data-size='xs'],
.event-theme .mantine-Button-root[data-size='compact-xs'] {
  --ring: 2px;
  padding-inline: 0.625rem;
  letter-spacing: 0.02em !important;
}
.event-theme .mantine-Button-root[data-size='sm'],
.event-theme .mantine-Button-root[data-size='compact-sm'] {
  --ring: 3px;
  padding-inline: 0.625rem;
  letter-spacing: 0.02em !important;
}
.event-theme .mantine-Button-root .mantine-Button-label {
  white-space: normal;
  text-align: center;
  line-height: 1.2;
}
/* The main button: the Start design. */
.event-theme .mantine-Button-root:not([data-variant]),
.event-theme .mantine-Button-root[data-variant='filled'] {
  --button-bg: var(--event-button-bg) !important;
  --button-hover: color-mix(in srgb, var(--event-button-bg) 86%, var(--event-button-text)) !important;
  --button-color: var(--event-button-text) !important;
  --button-bd: var(--ring) solid var(--event-button-ring) !important;
}
.event-theme .mantine-Button-root:not([data-variant]):not(:disabled):not([data-disabled]),
.event-theme .mantine-Button-root[data-variant='filled']:not(:disabled):not([data-disabled]) {
  box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--event-button-bg) 45%, transparent);
}
/* The quieter button: the same design inverted, the label colour as the fill and the fill colour as the label, with the same ring. */
.event-theme .mantine-Button-root[data-variant='light'],
.event-theme .mantine-Button-root[data-variant='default'],
.event-theme .mantine-Button-root[data-variant='outline'] {
  --button-bg: var(--event-button-text) !important;
  --button-hover: color-mix(in srgb, var(--event-button-text) 86%, var(--event-button-bg)) !important;
  --button-color: var(--event-button-bg) !important;
  --button-bd: var(--ring) solid var(--event-button-ring) !important;
}
.event-theme .mantine-Input-input,
.event-theme .mantine-TextInput-input {
  background: var(--event-card-bg);
  color: var(--event-card-text);
  border-color: color-mix(in srgb, var(--event-card-text) 28%, var(--event-card-bg));
}
.event-theme .mantine-AppShell-header {
  background: transparent;
  color: var(--event-heading);
  border-color: color-mix(in srgb, var(--event-heading) 22%, transparent);
}
.event-theme .mantine-AppShell-main {
  background: transparent;
}
.event-theme [data-event-stage] .mantine-Badge-root {
  display: none;
}
/* A smaller stage, so a whole step fits above the browser bar of a phone: tighter spacing, smaller titles. */
.event-theme [data-event-stage] {
  --mantine-spacing-lg: 1rem;
  --mantine-spacing-md: 0.75rem;
  --mantine-h2-font-size: 1.5rem;
  --mantine-h4-font-size: 1rem;
}
/* The Google and Facebook buttons sit side by side, so the mark and the name are centred together, not pushed to the two edges. */
.event-theme [data-event-stage] a.mantine-Button-root[href*='provider='] .mantine-Button-inner {
  justify-content: center;
  gap: 0.5rem;
}
.event-theme [data-event-stage] a.mantine-Button-root[href*='provider='] .mantine-Button-label {
  flex: 0 1 auto;
}
`;
