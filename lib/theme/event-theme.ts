/**
 * The look of an event's guest pages (camera#285, docs/JOURNEY_DESIGN_PLAN.md): one theme, resolved on the server, used by every page of
 * the guest journey. It comes from the messmass style snapshot of the event (the same snapshot the generated frame is drawn from), so
 * the pages and the frame agree; an event without a snapshot gets the system default style of messmass, with the event's own brand
 * colour as the button colour when it has one.
 *
 * Contrast is guaranteed, not trusted: text is only used where it reads (WCAG 4.5:1, 3:1 for the large button labels), a button colour
 * only where it stands out from its card and from the page (3:1). A colour that fails is **repaired, not replaced** (camera#336): the same hue,
 * darker or lighter in steps of 5% until it passes; white or black only when no variant of it can pass. So a messmass style can never make
 * a page unreadable, and the page keeps the colours of the club.
 * Pure and DOM-free; unit-tested in event-theme.test.ts.
 */

import { EVENT_THEME_DEFAULT } from '@/lib/gds/tokens/colors';
import type { FrameContext, PageStyle } from '@/lib/frame/context';
import { eventEmoji } from '@/lib/frame/emoji';
import { bestOfWhiteOrBlack, contrast, isDark, mix, opaque, readable, repaired } from '@/lib/theme/color';
import { isLogoStorageHostname } from '@/lib/imgbb/url';

export type FontSource = 'google' | 'custom' | 'system';

export interface EventTheme {
  /** `messmass`: from the event's style snapshot; `event`: the system default look with the event's brand colour; `default`: the system default look. */
  source: 'messmass' | 'event' | 'default';
  /** Opaque #RRGGBB colours. */
  background: string;
  /** Heading and other text on the page background. */
  heading: string;
  /** Dimmed text (descriptions, hints) on the page background: the heading colour, softened, still 4.5:1. */
  headingMuted: string;
  cardBackground: string;
  cardBorder: string;
  /** Text on a card. */
  cardText: string;
  /** Dimmed text (descriptions, hints, placeholders) on a card, still 4.5:1. */
  cardMuted: string;
  /** The edge of an input on a card, at least 3:1 against the card. */
  inputBorder: string;
  buttonBackground: string;
  buttonText: string;
  /** The ring round every button (camera#334): the colour the club set on its welcome page's Start button, else the label colour. */
  buttonRing: string;
  /** Link colour on a card. */
  link: string;
  /** A CSS length (px, rem or em). */
  radius: string;
  dark: boolean;
  /** The partner's logo (https), else null. */
  logoUrl: string | null;
  /** The event's emoji, for an event with no logo. */
  emoji: string | null;
  /** The picture under the card of the guest emails (https, an allowed image host), else null (camera#310). */
  emailFooterImageUrl: string | null;
  font: {
    family: string;
    source: FontSource;
    /** Path on the messmass origin of a custom font file. */
    file: string | null;
    /** The custom font file as an absolute URL for the browser (set where the messmass address is known, lib/theme/load.ts). */
    url: string | null;
  };
}

export interface ThemeInput {
  /** The event's own brand colour from the editor (#RRGGBB), used for buttons when messmass gives no usable button colour. */
  brandColor?: string | null;
  /** The event's own ring colour from the editor (#RRGGBB): the ring of every button when the welcome page sets none. */
  brandBorderColor?: string | null;
  /**
   * The colours the club set on the Start button of its welcome page (fill, label, ring). The button of the whole flow looks like the Start button
   * (camera#334), so these win over everything else; only the label is still checked for contrast.
   */
  buttons?: { fill?: unknown; label?: unknown; ring?: unknown } | null;
  /** The event's email footer picture (event.emailFooterImageUrl). */
  emailFooterImageUrl?: string | null;
  /** The snapshot of the messmass (or fallback) data the generated frame is drawn from. */
  context?: FrameContext | null;
}

/** How much of the button colour tints a selected card (a ticked consent box): the links on it must still read. */
export const SELECTED_TINT = 0.08;

const RADIUS = /^\d{1,2}(?:\.\d{1,2})?(?:px|rem|em)$/;
const MAX_RADIUS_REM = 2;

function radiusOf(value: string | undefined): string {
  if (!value || !RADIUS.test(value)) return EVENT_THEME_DEFAULT.cardRadius;
  const n = parseFloat(value);
  const rem = value.endsWith('px') ? n / 16 : n;
  return rem > MAX_RADIUS_REM ? `${MAX_RADIUS_REM}rem` : value;
}

const DEFAULT_PAGE: PageStyle = {
  pageBackground: EVENT_THEME_DEFAULT.heroBackground,
  textColor: EVENT_THEME_DEFAULT.textColor,
  cardBackground: EVENT_THEME_DEFAULT.cardBackground,
  cardBorder: EVENT_THEME_DEFAULT.cardBorder,
  buttonBackground: EVENT_THEME_DEFAULT.buttonBackground,
  buttonText: EVENT_THEME_DEFAULT.buttonText,
  accentColor: EVENT_THEME_DEFAULT.accentColor,
  linkColor: EVENT_THEME_DEFAULT.linkColor,
  cardRadius: EVENT_THEME_DEFAULT.cardRadius,
};

export function resolveEventTheme({ brandColor, brandBorderColor, context, emailFooterImageUrl, buttons }: ThemeInput): EventTheme {
  const style = context?.style;
  const page = style?.page ?? DEFAULT_PAGE;
  const fromMessmass = context?.source === 'messmass';

  const background = opaque(style?.heroBackground) ?? opaque(EVENT_THEME_DEFAULT.heroBackground)!;
  const heading = readable(opaque(style?.headingColor, hexRgb(background)), background);
  const cardBackground = opaque(page.cardBackground, hexRgb(background)) ?? '#ffffff';
  const cardText = readable(opaque(page.textColor, hexRgb(cardBackground)), cardBackground);
  const cardBorder = opaque(page.cardBorder, hexRgb(cardBackground)) ?? cardBackground;

  // The colours of the buttons (camera#336), in this order of precedence: the Start button of the welcome page, then the event's own colours (the
  // editor's brand colour and ring), then the ones derived from the style. A button sits on a card (login, consent) or straight on the page (the
  // photo steps), so its fill must stand out from both (3:1): a colour that does not is made to, keeping its hue.
  const brand = opaque(brandColor);
  const stands = [cardBackground, background];
  const fromStyle = [opaque(page.buttonBackground, hexRgb(cardBackground)), opaque(page.accentColor, hexRgb(cardBackground))].filter((c): c is string => !!c);
  const welcomeFill = opaque(buttons?.fill);
  const eventFill = repaired(brand, stands, 3);
  // Derived: the style's own button or accent if it stands out as it is, else the accent (or the style's button) made to stand out; failing that
  // the card's text colour, black or white, whichever stands out best.
  const derivedFill =
    fromStyle.find((c) => repaired(c, stands, 3) === c) ?? repaired(fromStyle[1] ?? fromStyle[0], stands, 3) ?? repaired(fromStyle[0], stands, 3) ?? null;
  const fallbackFill = [cardText, '#000000', '#ffffff'].sort((a, b) => Math.min(contrast(b, cardBackground), contrast(b, background)) - Math.min(contrast(a, cardBackground), contrast(a, background)))[0];
  const buttonBackground = welcomeFill ?? eventFill ?? derivedFill ?? fallbackFill;
  // The label: the club's own, else the style's own label when the fill is the style's own button as it is, else white or black by contrast; always
  // at least 3:1 on the fill.
  const styleLabel = buttonBackground === opaque(page.buttonBackground, hexRgb(cardBackground)) ? opaque(page.buttonText, hexRgb(buttonBackground)) : null;
  const buttonText = repaired(opaque(buttons?.label, hexRgb(buttonBackground)) ?? styleLabel, [buttonBackground], 3) ?? bestOfWhiteOrBlack([buttonBackground]);
  const buttonRing = opaque(buttons?.ring) ?? repaired(opaque(brandBorderColor), stands, 3) ?? buttonText;
  const selectedCard = mix(buttonBackground, cardBackground, SELECTED_TINT);
  const link = repaired(opaque(page.linkColor, hexRgb(cardBackground)), [cardBackground, selectedCard]) ?? bestOfWhiteOrBlack([cardBackground, selectedCard]);
  // Dimmed text and the edge of an input are shades of the text colour, and read as well as the text does (camera#336).
  const headingMuted = readable(mix(heading, background, 0.62), background);
  const cardMuted = readable(mix(cardText, cardBackground, 0.62), cardBackground);
  const inputBorder = repaired(mix(cardText, cardBackground, 0.5), [cardBackground], 3) ?? bestOfWhiteOrBlack([cardBackground]);

  const partnerLogo = allowedImage(context?.partner?.logoUrl);
  const emoji = partnerLogo || !context ? null : eventEmoji({ name: context.event.name, homeTeam: context.event.homeTeam, visitorTeam: context.event.visitorTeam }, context.partner?.name);

  return {
    source: fromMessmass ? 'messmass' : brand ? 'event' : 'default',
    background,
    heading,
    headingMuted,
    cardBackground,
    cardBorder,
    cardText,
    cardMuted,
    inputBorder,
    buttonBackground,
    buttonText,
    buttonRing,
    link,
    radius: radiusOf(page.cardRadius),
    dark: isDark(background),
    logoUrl: partnerLogo,
    emoji,
    emailFooterImageUrl: allowedImage(emailFooterImageUrl),
    font: { family: style?.fontFamily ?? 'Inter', source: style?.fontSource ?? 'google', file: style?.fontFile ?? null, url: null },
  };
}

/**
 * The hosts the guest pages may load images from (the Content-Security-Policy of next.config.ts): a logo anywhere else would not show, so it
 * is not used and the event's emoji takes its place.
 */
const IMAGE_HOSTS = [/^i\.ibb\.co$/, /^imgbb\.com$/, /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/];
export function allowedImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (IMAGE_HOSTS.some((host) => host.test(parsed.hostname)) || isLogoStorageHostname(parsed.hostname)) ? url : null;
  } catch {
    return null;
  }
}

function hexRgb(hex: string) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
