'use client';

/**
 * The giant screen as code (camera#315): a 16:9 LED wall in CSS 3D (a box with a bezel, depth, a pixel grid and a soft shadow) that shows one
 * picture on its face, tilted towards the guest and swaying slowly. Made of nothing but CSS and one image, so it is sharp on any screen, costs
 * no 3D library and no extra download, and holds still for guests who ask their device for less motion.
 *
 * It is one element of a group with the Start button of the welcome step (WelcomePage): the screen sits above the button in the normal flow and the
 * group as a whole is centred in the visible screen (owner, 2026-10-07). So it is sized by what the group needs: the width is the smallest of 88% of
 * the viewport width, a fixed maximum, and what fits in the height with the button under it (the box is 16:9; 5.5rem is the button, the gap and the
 * shadow room, 6svh the margins; the factor 1.5 is 1 / (9/16 + 0.06 of the shadow gap + 0.04 that the tilt lifts the near edge)). Every colour comes
 * from a * token or is mixed from one, so the colour gate stays green.
 */

import { CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';

const metal = (white: number) => `color-mix(in srgb, ${CAMERA_STAGE_WHITE} ${white}%, ${CAMERA_STAGE_BLACK})`;
const ink = (black: number) => `color-mix(in srgb, ${CAMERA_STAGE_BLACK} ${black}%, transparent)`;
const light = (white: number) => `color-mix(in srgb, ${CAMERA_STAGE_WHITE} ${white}%, transparent)`;

export const LED_SCREEN_CSS = `
.led3d {
  --led-w: max(9rem, min(88vw, 60rem, calc((100svh - var(--gds-safe-area-inset-top, 0px) - 5.5rem - max(1.2rem, 6svh)) * 1.5)));
  --led-d: calc(var(--led-w) * 0.05);
  --led-bezel: calc(var(--led-w) * 0.014);
  position: relative;
  flex: none;
  width: var(--led-w);
  aspect-ratio: 16 / 9;
  /* The shadow under the screen and a gap to the Start button below it. */
  margin-bottom: calc(var(--led-w) * 0.06 + 1.2rem);
  perspective: calc(var(--led-w) * 3.2);
  perspective-origin: 50% 40%;
  pointer-events: none;
}
.led3d-body {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transform: rotateX(5deg) rotateY(-14deg);
  animation: led3d-sway 10s ease-in-out infinite alternate;
}
.led3d-face { position: absolute; backface-visibility: hidden; box-sizing: border-box; }
.led3d-front {
  inset: 0;
  transform: translateZ(calc(var(--led-d) / 2));
  border-radius: calc(var(--led-w) * 0.014);
  background: linear-gradient(145deg, ${metal(30)}, ${metal(8)} 55%, ${metal(18)});
  box-shadow: inset 0 0 0 1px ${light(18)}, inset 0 0 calc(var(--led-w) * 0.02) ${ink(60)};
}
.led3d-glass {
  position: absolute;
  inset: var(--led-bezel);
  overflow: hidden;
  border-radius: calc(var(--led-w) * 0.006);
  background: ${CAMERA_STAGE_BLACK};
}
.led3d-glass img { display: block; width: 100%; height: 100%; object-fit: cover; user-select: none; -webkit-user-drag: none; }
/* The pixels of the wall: faint lines in both directions, so the picture still reads clearly and does not show as moire on a small screen. */
.led3d-grid {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, ${ink(10)} 0 1px, transparent 1px max(4px, calc(var(--led-w) / 110))),
    repeating-linear-gradient(90deg, ${ink(10)} 0 1px, transparent 1px max(4px, calc(var(--led-w) / 110)));
}
/* The reflection of the room on the glass. */
.led3d-gloss {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, ${light(20)} 0%, ${light(6)} 28%, transparent 46%, transparent 100%);
}
.led3d-back { inset: 0; transform: rotateY(180deg) translateZ(calc(var(--led-d) / 2)); background: ${metal(10)}; }
.led3d-right, .led3d-left {
  top: 0; bottom: 0; left: 50%; width: var(--led-d); margin-left: calc(var(--led-d) / -2);
  background: linear-gradient(90deg, ${metal(14)}, ${metal(28)} 50%, ${metal(12)});
}
.led3d-right { transform: rotateY(90deg) translateZ(calc(var(--led-w) / 2)); }
.led3d-left { transform: rotateY(-90deg) translateZ(calc(var(--led-w) / 2)); }
.led3d-top, .led3d-bottom {
  left: 0; right: 0; top: 50%; height: var(--led-d); margin-top: calc(var(--led-d) / -2);
  background: linear-gradient(0deg, ${metal(14)}, ${metal(30)} 50%, ${metal(12)});
}
.led3d-top { transform: rotateX(90deg) translateZ(calc(var(--led-w) * 9 / 32)); }
.led3d-bottom { transform: rotateX(-90deg) translateZ(calc(var(--led-w) * 9 / 32)); }
.led3d-shadow {
  position: absolute;
  left: 8%; right: 8%;
  bottom: calc(var(--led-w) * -0.075);
  height: calc(var(--led-w) * 0.07);
  background: radial-gradient(ellipse at center, ${ink(55)}, transparent 70%);
  filter: blur(calc(var(--led-w) * 0.012));
}
@keyframes led3d-sway {
  from { transform: rotateX(6deg) rotateY(-19deg); }
  to { transform: rotateX(4deg) rotateY(-9deg); }
}
@media (prefers-reduced-motion: reduce) {
  .led3d-body { animation: none; }
}
`;

export interface LedScreen3DProps {
  imageUrl: string;
  /** What the picture on the screen shows, for screen readers. */
  alt: string;
}

export default function LedScreen3D({ imageUrl, alt }: LedScreen3DProps) {
  return (
    <div className="led3d" data-led-screen>
      <style>{LED_SCREEN_CSS}</style>
      <div className="led3d-shadow" aria-hidden />
      <div className="led3d-body">
        <div className="led3d-face led3d-back" aria-hidden />
        <div className="led3d-face led3d-left" aria-hidden />
        <div className="led3d-face led3d-right" aria-hidden />
        <div className="led3d-face led3d-top" aria-hidden />
        <div className="led3d-face led3d-bottom" aria-hidden />
        <div className="led3d-face led3d-front">
          <div className="led3d-glass">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={alt} decoding="async" draggable={false} />
            <div className="led3d-grid" aria-hidden />
            <div className="led3d-gloss" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
