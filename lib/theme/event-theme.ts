/**
 * The look of an event's guest pages (camera#285, docs/JOURNEY_DESIGN_PLAN.md): one theme, resolved on the server, used by every page of
 * the guest journey. It comes from the messmass style snapshot of the event (the same snapshot the generated frame is drawn from), so
 * the pages and the frame agree; an event without a snapshot gets the system default style of messmass, with the event's own brand
 * colour as the button colour when it has one.
 *
 * Contrast is guaranteed, not trusted: text is only used where it reads (WCAG 4.5:1, 3:1 for the large button labels), a button colour
 * only where it stands out from its card (3:1); anything else is corrected, so a messmass style can never make a page unreadable.
 * Pure and DOM-free; unit-tested in event-theme.test.ts.
 */

import { EVENT_THEME_DEFAULT } from '@/lib/gds/tokens/colors';
import type { FrameContext, PageStyle } from '@/lib/frame/context';
import { eventEmoji } from '@/lib/frame/emoji';
import { contrast, isDark, opaque, readable } from '@/lib/theme/color';

export type FontSource = 'google' | 'custom' | 'system';

export interface EventTheme {
  /** `messmass`: from the event's style snapshot; `event`: the system default look with the event's brand colour; `default`: the system default look. */
  source: 'messmass' | 'event' | 'default';
  /** Opaque #RRGGBB colours. */
  background: string;
  /** Heading and other text on the page background. */
  heading: string;
  cardBackground: string;
  cardBorder: string;
  /** Text on a card. */
  cardText: string;
  buttonBackground: string;
  buttonText: string;
  /** Link colour on a card. */
  link: string;
  /** A CSS length (px, rem or em). */
  radius: string;
  dark: boolean;
  /** The partner's logo (https), else null. */
  logoUrl: string | null;
  /** The event's emoji, for an event with no logo. */
  emoji: string | null;
  font: { family: string; source: FontSource; /** Path on the messmass origin of a custom font file. */ file: string | null };
}

export interface ThemeInput {
  /** The event's own brand colour from the editor (#RRGGBB), used for buttons when messmass gives no usable button colour. */
  brandColor?: string | null;
  /** The snapshot of the messmass (or fallback) data the generated frame is drawn from. */
  context?: FrameContext | null;
}

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

export function resolveEventTheme({ brandColor, context }: ThemeInput): EventTheme {
  const style = context?.style;
  const page = style?.page ?? DEFAULT_PAGE;
  const fromMessmass = context?.source === 'messmass';

  const background = opaque(style?.heroBackground) ?? opaque(EVENT_THEME_DEFAULT.heroBackground)!;
  const heading = readable(opaque(style?.headingColor, hexRgb(background)), background);
  const cardBackground = opaque(page.cardBackground, hexRgb(background)) ?? '#ffffff';
  const cardText = readable(opaque(page.textColor, hexRgb(cardBackground)), cardBackground);
  const cardBorder = opaque(page.cardBorder, hexRgb(cardBackground)) ?? cardBackground;

  // The first colour that stands out from the card (3:1): the style's button, its accent, the event's brand colour, else the card's text.
  const brand = opaque(brandColor);
  const candidates = [opaque(page.buttonBackground, hexRgb(cardBackground)), opaque(page.accentColor, hexRgb(cardBackground)), brand];
  const buttonBackground = candidates.find((c): c is string => !!c && contrast(c, cardBackground) >= 3) ?? cardText;
  // Button labels are large and bold (WCAG large text): 3:1 is enough.
  const buttonText = readable(opaque(page.buttonText, hexRgb(buttonBackground)), buttonBackground, 3);
  const link = readable(opaque(page.linkColor, hexRgb(cardBackground)), cardBackground);

  const partnerLogo = context?.partner?.logoUrl ?? null;
  const emoji = partnerLogo || !context ? null : eventEmoji({ name: context.event.name, homeTeam: context.event.homeTeam, visitorTeam: context.event.visitorTeam }, context.partner?.name);

  return {
    source: fromMessmass ? 'messmass' : brand ? 'event' : 'default',
    background,
    heading,
    cardBackground,
    cardBorder,
    cardText,
    buttonBackground,
    buttonText,
    link,
    radius: radiusOf(page.cardRadius),
    dark: isDark(background),
    logoUrl: partnerLogo,
    emoji,
    font: { family: style?.fontFamily ?? 'Inter', source: style?.fontSource ?? 'google', file: style?.fontFile ?? null },
  };
}

function hexRgb(hex: string) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
