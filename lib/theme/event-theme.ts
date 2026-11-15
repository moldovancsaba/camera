/**
 * The look of an event's guest pages (camera#285, docs/JOURNEY_DESIGN_PLAN.md): one theme, resolved on the server, used by every page of
 * the guest journey. It comes from the messmass style snapshot of the event (the same snapshot the generated frame is drawn from), so
 * the pages and the frame agree; an event without a snapshot gets the system default style of messmass, with the event's own brand
 * colour as the button colour when it has one.
 *
 * Configured colors are never contrast-corrected. The admin receives contrast warnings, while the guest experience renders the selected palette
 * exactly as configured. This lets partners keep their Messmass design without Camera silently changing any color.
 * Pure and DOM-free; unit-tested in event-theme.test.ts.
 */

import { EVENT_THEME_DEFAULT } from '@/lib/gds/tokens/colors';
import type { FrameContext, PageStyle } from '@/lib/frame/context';
import { eventEmoji } from '@/lib/frame/emoji';
import { contrast, isDark, mix, opaque } from '@/lib/theme/color';
import { isLogoStorageHostname } from '@/lib/imgbb/url';

export type FontSource = 'google' | 'custom' | 'system';

/**
 * Where the fill of the buttons comes from, in the order of precedence: `welcome` the colours of the Start button of the welcome page, `event` the event's own
 * colour (set in the editor, or the default of its partner), `messmass` the configured report button fill, `default` the system default look.
 */
export type ButtonColourSource = 'welcome' | 'event' | 'messmass' | 'default';

export interface EventTheme {
  /** `messmass`: from the event's style snapshot; `event`: the system default look with the event's brand colour; `default`: the system default look. */
  source: 'messmass' | 'event' | 'default';
  /** Opaque #RRGGBB colours. */
  background: string;
  /** Heading and other text on the page background. */
  heading: string;
  /** Secondary text on the page; currently the configured heading color because Messmass has no separate muted token. */
  headingMuted: string;
  cardBackground: string;
  cardBorder: string;
  /** Text on a card. */
  cardText: string;
  /** Secondary text on a card; currently the configured card text color because Messmass has no separate muted token. */
  cardMuted: string;
  /** The configured card border color, reused for input edges. */
  inputBorder: string;
  buttonBackground: string;
  buttonText: string;
  /** The ring round every button, using the configured source color. */
  buttonRing: string;
  /** Accent used for selection and focus controls, kept separate from the configured button fill. */
  controlAccent: string;
  /** Configured mark/label color on `controlAccent`. */
  controlAccentText: string;
  /** Contrast warnings for the admin editor. These describe the palette; guest colors are never auto-corrected. */
  contrastWarnings: string[];
  /** Where the fill of the buttons comes from (the admin shows it next to the colours, so the editor knows which setting decides). */
  buttonSource: ButtonColourSource;
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

/** A theme may be partial in parent-level journey editors with no selected event context. */
export type EventThemePreview = Partial<Omit<EventTheme, 'font'>> & { font?: Partial<EventTheme['font']> };

export interface ThemeInput {
  /** The event's own brand colour from the editor (#RRGGBB), used for buttons before the Messmass style. */
  brandColor?: string | null;
  /** The event's own ring colour from the editor (#RRGGBB): the ring of every button when the welcome page sets none. */
  brandBorderColor?: string | null;
  /**
   * The colours the club set on the Start button of its welcome page (fill, label, ring). The button of the whole flow looks like the Start button
   * (camera#334), so these win over everything else. Colors are rendered as configured and contrast issues are reported to admins.
   */
  buttons?: { fill?: unknown; label?: unknown; ring?: unknown } | null;
  /** The event's email footer picture (event.emailFooterImageUrl). */
  emailFooterImageUrl?: string | null;
  /** The snapshot of the messmass (or fallback) data the generated frame is drawn from. */
  context?: FrameContext | null;
}

/** How much of the configured accent tints a selected card (a ticked consent box). */
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
  const heading = opaque(style?.headingColor, hexRgb(background)) ?? EVENT_THEME_DEFAULT.textColor;
  const cardBackground = opaque(page.cardBackground, hexRgb(background)) ?? '#ffffff';
  const cardText = opaque(page.textColor, hexRgb(cardBackground)) ?? EVENT_THEME_DEFAULT.textColor;
  const cardBorder = opaque(page.cardBorder, hexRgb(cardBackground)) ?? cardBackground;

  // Render the configured values directly. Contrast checks below are diagnostic only and never alter the guest UI.
  const brand = opaque(brandColor);
  const messmassFill = fromMessmass ? opaque(page.buttonBackground, hexRgb(cardBackground)) : null;
  const welcomeFill = opaque(buttons?.fill);
  const buttonBackground = welcomeFill ?? brand ?? messmassFill ?? opaque(page.buttonBackground, hexRgb(cardBackground)) ?? EVENT_THEME_DEFAULT.buttonBackground;
  const buttonSource: ButtonColourSource = welcomeFill ? 'welcome' : brand ? 'event' : fromMessmass ? 'messmass' : 'default';
  const buttonText = opaque(buttons?.label, hexRgb(buttonBackground)) ?? opaque(page.buttonText, hexRgb(buttonBackground)) ?? EVENT_THEME_DEFAULT.buttonText;
  const buttonRing = opaque(buttons?.ring, hexRgb(buttonBackground)) ?? opaque(brandBorderColor, hexRgb(buttonBackground)) ?? opaque(page.accentColor, hexRgb(buttonBackground)) ?? buttonText;
  const controlAccent = opaque(page.accentColor, hexRgb(cardBackground)) ?? buttonBackground;
  const controlAccentText = buttonText;
  const selectedCard = mix(controlAccent, cardBackground, SELECTED_TINT);
  const link = opaque(page.linkColor, hexRgb(cardBackground)) ?? EVENT_THEME_DEFAULT.linkColor;
  // Messmass has no muted-text or input-border color token. Reuse its text and card-border values rather than derive new colors.
  const headingMuted = heading;
  const cardMuted = cardText;
  const inputBorder = cardBorder;
  const contrastWarnings: string[] = [];
  const warn = (label: string, foreground: string, surface: string, minimum: number) => {
    const ratio = contrast(foreground, surface);
    if (ratio < minimum) contrastWarnings.push(`${label}: ${ratio.toFixed(1)}:1 (recommended ${minimum}:1).`);
  };
  warn('Page heading on page background', heading, background, 4.5);
  warn('Card text on card background', cardText, cardBackground, 4.5);
  warn('Link on card background', link, cardBackground, 4.5);
  warn('Link on selected card background', link, selectedCard, 4.5);
  warn('Button text on button fill', buttonText, buttonBackground, 3);
  warn('Button fill against card background', buttonBackground, cardBackground, 3);
  warn('Button fill against page background', buttonBackground, background, 3);
  warn('Button ring against button fill', buttonRing, buttonBackground, 3);
  warn('Selected-control color on card background', controlAccent, cardBackground, 3);
  warn('Selected-control color on page background', controlAccent, background, 3);
  warn('Selected-control mark on selected-control color', controlAccentText, controlAccent, 3);
  warn('Input/card border against card background', inputBorder, cardBackground, 3);

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
    buttonSource,
    controlAccent,
    controlAccentText,
    contrastWarnings,
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
const IMAGE_HOSTS = [/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/];
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
