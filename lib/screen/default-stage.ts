/**
 * The default stage of a giant screen (camera#326, docs/WELCOME_AND_DEFAULTS_PLAN.md items 1 to 5, docs/BUILDING_BRICKS.md 6.2): where the parts sit and the picture
 * drawn over the stage, generated from the event's own colours so every event has a ready-to-go screen the editor can replace. Everything is placed in percent of a
 * 16:9 stage (1920 x 1080), the same unit as `ScreenDesign` (lib/slideshow/screen-design.ts), so the live stage and the picture of the welcome page screen use one layout.
 *
 * The picture has a transparent window where the photos play, a light panel behind the QR code (the QR modules are drawn live over it), a band under the window for the
 * written address and a stadium-like background: pitch circle and half-way line, glow of the floodlights, in the colours of the event. The texts and the QR code are
 * not in the picture: the stage draws them (and the server renderer of the welcome page screen draws them the same way).
 */

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { CAMERA_STAGE_BLACK, CAMERA_STAGE_QR_DARK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { bestOfWhiteOrBlack, isDark, mix } from '@/lib/theme/color';

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Where the parts sit, % of the stage: the photo window and the QR code's size measured from the MTK x Vasas design. Under the photos there is **one line, the written address**
 * (owner, 2026-10-09: the event's own slug when it has one, else the tracked link's), as wide as the window and scaled to fill that width (`fit`; `size` is the largest it may take). The
 * QR code sits alone, centred in its panel (the panel spans 2 % to 98 % of the height, the QR code is `size x 16/9` % tall).
 */
export const DEFAULT_STAGE = {
  window: { left: 2.075, top: 3.081, width: 69.274, height: 69.273 },
  qr: { x: 73.54, y: 28.33, size: 24.375 },
  addressText: { x: 2.075, y: 80.9, width: 69.274, size: 10 },
} as const;

/** The space the band keeps above and below the address line, % of the stage height. */
const BAND_PADDING = 1.5;

export interface StageColours {
  /** The page colour of the event, opaque #RRGGBB. */
  background: string;
  /** The event's button colour, opaque #RRGGBB. */
  accent: string;
}

/** The colours the live texts and the QR code take on this stage: readable on the panels, the QR dark on its light panel. */
export function stagePalette(colours: StageColours) {
  const panel = mix(colours.accent, colours.background, 0.28);
  return { panel, text: bestOfWhiteOrBlack([panel]), qr: CAMERA_STAGE_QR_DARK, qrPanel: CAMERA_STAGE_WHITE };
}

const px = (percent: number, of: number) => (percent / 100) * of;

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** The picture of the default stage as a PNG, 1920 x 1080, transparent where the photos play. Deterministic for the same colours. */
export function renderDefaultOverlay(colours: StageColours): Buffer {
  const canvas = createCanvas(STAGE_WIDTH, STAGE_HEIGHT);
  const ctx = canvas.getContext('2d');
  const { background, accent } = colours;
  const deep = mix(CAMERA_STAGE_BLACK, background, 0.4);
  const dark = isDark(background);

  // Background: the page colour fading to a deeper one, like a stadium at night (or a lighter stand for a light page).
  const base = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
  base.addColorStop(0, background);
  base.addColorStop(1, dark ? deep : mix(CAMERA_STAGE_BLACK, background, 0.12));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  // The glow of the floodlights in the top corners.
  for (const [cx, cy] of [[0, 0], [STAGE_WIDTH, 0]] as const) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760);
    glow.addColorStop(0, `${accent}66`);
    glow.addColorStop(1, `${accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  }

  // The pitch: the centre circle and the half-way line, faint, behind the window.
  const w = DEFAULT_STAGE.window;
  const wx = px(w.left, STAGE_WIDTH), wy = px(w.top, STAGE_HEIGHT), ww = px(w.width, STAGE_WIDTH), wh = px(w.height, STAGE_HEIGHT);
  ctx.strokeStyle = `${accent}44`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(wx + ww / 2, wy + wh / 2, 470, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, 0);
  ctx.lineTo(wx + ww / 2, STAGE_HEIGHT);
  ctx.stroke();

  // The panel of the right column and the band under the window for the written address.
  const panelFill = mix(accent, background, 0.28);
  ctx.fillStyle = `${panelFill}d9`;
  roundedRect(ctx, px(72.5, STAGE_WIDTH), px(2, STAGE_HEIGHT), px(26.2, STAGE_WIDTH), px(96, STAGE_HEIGHT), 30);
  ctx.fill();
  // The band holds the one line, the written address (the line is 1.15 times its largest size tall).
  const band = DEFAULT_STAGE.addressText;
  const bandTop = band.y - BAND_PADDING;
  const bandBottom = band.y + band.size * 1.15 + BAND_PADDING;
  roundedRect(ctx, px(band.x, STAGE_WIDTH), px(bandTop, STAGE_HEIGHT), px(band.width, STAGE_WIDTH), px(bandBottom - bandTop, STAGE_HEIGHT), 26);
  ctx.fill();

  // The light panel behind the QR code.
  const qr = DEFAULT_STAGE.qr;
  const qx = px(qr.x, STAGE_WIDTH), qy = px(qr.y, STAGE_HEIGHT), qs = px(qr.size, STAGE_WIDTH);
  ctx.fillStyle = CAMERA_STAGE_WHITE;
  roundedRect(ctx, qx - 18, qy - 18, qs + 36, qs + 36, 28);
  ctx.fill();

  // The window: an accent border, then the opening itself, transparent.
  ctx.fillStyle = accent;
  roundedRect(ctx, wx - 10, wy - 10, ww + 20, wh + 20, 34);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = CAMERA_STAGE_BLACK;
  roundedRect(ctx, wx, wy, ww, wh, 26);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  return canvas.toBuffer('image/png');
}
