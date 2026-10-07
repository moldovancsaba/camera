'use client';

/**
 * Draws everything inside it with the theme of the event (camera#285, docs/JOURNEY_DESIGN_PLAN.md): sets the theme's custom properties on a
 * wrapper and carries them onto the cards, buttons and text of the Mantine / GDS components inside (lib/theme/css.ts). The page behind the
 * wrapper and the browser's own chrome take the background colour as well, so nothing outside the page shows another colour.
 */

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { EVENT_THEME_CSS, fontFaceCss, googleFontHref, themeVariables } from '@/lib/theme/css';
import type { EventTheme } from '@/lib/theme/event-theme';

/** The theme of the event the page belongs to, for components that draw its logo or emoji; null outside a themed page. */
const EventThemeContext = createContext<EventTheme | null>(null);
export const useEventTheme = (): EventTheme | null => useContext(EventThemeContext);

export default function EventThemeScope({ theme, children }: { theme: EventTheme; children: ReactNode }) {
  useEffect(() => {
    const body = document.body;
    const previous = body.style.backgroundColor;
    body.style.backgroundColor = theme.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previousMeta = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', theme.background);
    return () => {
      body.style.backgroundColor = previous;
      if (meta && previousMeta !== null) meta.setAttribute('content', previousMeta);
    };
  }, [theme.background]);

  return (
    <div className="event-theme" style={{ ...themeVariables(theme), minHeight: '100dvh' }} data-event-theme={theme.source}>
      <style>{EVENT_THEME_CSS}</style>
      <ThemeFont font={theme.font} />
      <EventThemeContext.Provider value={theme}>{children}</EventThemeContext.Provider>
    </div>
  );
}

/** Loads the font of the theme: a Google font by its stylesheet, a custom messmass font by an @font-face; a system font needs nothing. */
function ThemeFont({ font }: { font: EventTheme['font'] }) {
  const google = font.source === 'google' ? googleFontHref(font.family) : null;
  const face = font.source === 'custom' ? fontFaceCss(font.family, font.url) : null;
  return (
    <>
      {google ? <link rel="stylesheet" href={google} /> : null}
      {face ? <style>{face}</style> : null}
    </>
  );
}
