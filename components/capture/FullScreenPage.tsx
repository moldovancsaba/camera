'use client';

/**
 * The frame of a page that is one picture from edge to edge (the welcome step, the CTA page with a picture). It is a fixed box over the visible
 * screen, with the page colour of the event behind the picture (dark when the event has none), and the document itself takes that colour (and
 * does not bounce) while the page is shown, so the picture never shows white at an edge, while it loads, or when the page is pulled.
 *
 * The box is exactly the visible screen, not taller (camera#317). It was `100lvh` tall (#313) so the picture would reach under a phone's bottom bar,
 * but iPhone Safari 26 draws fixed content only above its floating bar, so the part under the bar, with the bottom layers of the design anchored
 * to it, was cut off (owner, 2026-10-07). The part of the screen the box does not reach takes the page colour (`pageColourCss`, lib/theme/css.ts).
 * Things meant for the middle of the screen sit in a flex column centred in the box, with the top inset of the notch as padding (WelcomePage), so they do
 * not depend on where the bottom edge is (CLAUDE.md section 7).
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { CAMERA_STAGE_BLACK } from '@/lib/gds/tokens/colors';

export default function FullScreenPage({ children, marker }: { children: ReactNode; marker: Record<`data-${string}`, string> }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const before = { background: root.style.backgroundColor, bounce: root.style.overscrollBehavior };
    root.style.backgroundColor = getComputedStyle(el).backgroundColor;
    root.style.overscrollBehavior = 'none';
    return () => {
      root.style.backgroundColor = before.background;
      root.style.overscrollBehavior = before.bounce;
    };
  }, []);

  return (
    <main
      ref={ref}
      {...marker}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: `var(--event-bg, ${CAMERA_STAGE_BLACK})` }}
    >
      {children}
    </main>
  );
}
