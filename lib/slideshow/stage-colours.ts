/**
 * The colours behind the pictures of a giant screen. What an editor chose for the slideshow wins; otherwise the screen is in the colours of the event's theme (its page colour,
 * fading to a deeper one like the default stage, lib/screen/default-stage.ts), because a screen is partner and event content and must not show another colour than the event's
 * (owner, 2026-10-09: "the visible background should follow the theme, no exception"). Only an event with no theme at all falls back to the indigo default.
 */

import { CAMERA_STAGE_BLACK, SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { isDark, mix } from '@/lib/theme/color';

export interface StageColours {
  primary: string;
  accent: string;
  /** `own`: both colours were set on the slideshow; `theme`: at least one comes from the event's theme; `default`: the built-in indigo. */
  source: 'own' | 'theme' | 'default';
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function stageColours(own: { primary?: unknown; accent?: unknown }, theme: { background: string } | null | undefined): StageColours {
  const ownPrimary = text(own.primary);
  const ownAccent = text(own.accent);
  if (ownPrimary && ownAccent) return { primary: ownPrimary, accent: ownAccent, source: 'own' };
  if (!theme) return { primary: ownPrimary ?? SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: ownAccent ?? SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, source: ownPrimary || ownAccent ? 'theme' : 'default' };
  const deep = mix(CAMERA_STAGE_BLACK, theme.background, isDark(theme.background) ? 0.4 : 0.12);
  return { primary: ownPrimary ?? theme.background, accent: ownAccent ?? deep, source: 'theme' };
}
