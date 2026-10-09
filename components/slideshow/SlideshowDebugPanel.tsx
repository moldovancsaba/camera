'use client';

/**
 * The corner panel of `?debug=1` (camera#476, step S1): the last events the player recorded, so the owner can screenshot what the screen
 * is doing without opening the developer tools. Hidden unless the address has `?debug=1`; it does not take part in the layout.
 */

import { useEffect, useState } from 'react';
import { CAMERA_STAGE_BLACK } from '@/lib/gds/tokens/colors';
import type { SlideshowEvent } from '@/lib/slideshow/diagnostics';

const SHOWN = 14;

function line(e: SlideshowEvent): string {
  const { t, type, ...rest } = e;
  return `${(t / 1000).toFixed(1).padStart(7)}s ${type} ${Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ')}`;
}

export default function SlideshowDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    setEnabled(true);
    const read = () => {
      const log = (window as unknown as { __slideshowLog?: SlideshowEvent[] }).__slideshowLog ?? [];
      setLines(log.slice(-SHOWN).map(line));
    };
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!enabled) return null;
  return (
    <pre
      aria-hidden
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        margin: 0,
        padding: 8,
        maxWidth: '70vw',
        overflow: 'hidden',
        zIndex: 2147483000,
        pointerEvents: 'none',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        color: 'white',
        background: `color-mix(in srgb, ${CAMERA_STAGE_BLACK} 75%, transparent)`,
      }}
    >
      {lines.join('\n') || 'slideshow diagnostics: waiting for events'}
    </pre>
  );
}
