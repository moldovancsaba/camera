'use client';

/**
 * The frame of a page that is one picture from edge to edge (the welcome step, the CTA page with a picture). It fills the whole screen,
 * including the part under a mobile browser's bars: on a phone the fixed box alone ends where the bottom bar begins, and the white of the
 * document showed between the picture and the bar (owner, 2026-10-07). So the box is as tall as the largest viewport (`lvh`, which reaches
 * under the bars), it has the page colour of the event behind the picture (dark when the event has none), and the document itself takes that colour (and does not bounce)
 * while the page is shown, so no white can appear at an edge, while the picture loads, or when the page is pulled.
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
      style={{ position: 'fixed', inset: 0, minHeight: '100lvh', overflow: 'hidden', background: `var(--event-bg, ${CAMERA_STAGE_BLACK})` }}
    >
      {children}
    </main>
  );
}
