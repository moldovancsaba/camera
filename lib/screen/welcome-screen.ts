/**
 * The picture of the welcome page screen (issue 327, docs/BUILDING_BRICKS.md 6.2): the giant screen of the default slideshow drawn once on the server as a 1920 x 1080 picture, the
 * way the stage draws it live, so the welcome page and the stage show one design. Back to front, as the player does: what is in the photo window, the overlay picture with its
 * transparent window, the QR code (its dark modules, from the same `qrcode` library the stage uses) and the texts (bold, one line, a soft shadow, in the event's font).
 *
 * What is in the window: the picture it is given (a sample selfie once the library has them) with the event's frame over it, or, when there is none yet, a stand-in drawn in the event's
 * colours (a head and shoulders), so the window is never an empty hole. Drawing needs the font registered by `resolveFrameFont` (lib/frame/fonts.ts); it is passed in as a canvas font
 * stack. The same sources give the same picture.
 */

import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import { CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { FIT_MAX_SIZE, fitSize, type ScreenDesign } from '@/lib/slideshow/screen-design';
import { mix } from '@/lib/theme/color';
import { STAGE_HEIGHT, STAGE_WIDTH, type StageColours } from './default-stage';

/** The size a line that fills its box is measured at. */
const FIT_REFERENCE_PX = 100;

/** Raise when the drawing changes, so every stored picture is drawn again. */
export const WELCOME_SCREEN_RENDER_VERSION = 1;

export interface WelcomeScreenSources {
  design: ScreenDesign;
  /** The overlay picture of the design, fetched. */
  overlay: Buffer;
  /** What fills the window; null draws the stand-in. */
  windowPicture: Buffer | null;
  /** The event's frame (transparent, 16:9) drawn over the window picture; null draws none. */
  frame: Buffer | null;
  /** The canvas font-family list of the event's font (`ResolvedFont.stack`). */
  fontStack: string;
  /** The event's colours, for the stand-in. */
  colours: StageColours;
}

const px = (percent: number, of: number) => (percent / 100) * of;
const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * Draws `image` into the rectangle so that it fills it (cropped), centred across and, for a picture taller than the rectangle (a portrait selfie in a wide window), a little above the middle
 * (`focusY` 0.3, 0 is the top and 0.5 the middle): the head is in the upper part of a selfie, so the crop keeps it.
 */
function drawCover(ctx: SKRSContext2D, image: { width: number; height: number }, x: number, y: number, w: number, h: number, focusY = 0.3): void {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image as never, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
}

/** A head and shoulders on a soft backdrop in the event's colours: stands in for a photo until there is one. */
function drawStandIn(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, colours: StageColours): void {
  const backdrop = ctx.createLinearGradient(x, y, x, y + h);
  backdrop.addColorStop(0, mix(colours.accent, colours.background, 0.45));
  backdrop.addColorStop(1, mix(colours.accent, colours.background, 0.75));
  ctx.fillStyle = backdrop;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = mix(CAMERA_STAGE_WHITE, colours.accent, 0.35);
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.4, h * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 1.02, h * 0.36, h * 0.38, 0, Math.PI, 0);
  ctx.fill();
}

function drawQr(ctx: SKRSContext2D, url: string, color: string | undefined, x: number, y: number, side: number): void {
  const { size, data } = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const cell = side / size;
  ctx.fillStyle = color && HEX.test(color) ? color : CAMERA_STAGE_WHITE;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; ) {
      if (!data[row * size + col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < size && data[row * size + col + run]) run += 1;
      // A hair wider than the module so neighbouring runs never show a seam.
      ctx.fillRect(x + col * cell, y + row * cell, run * cell + 0.5, cell + 0.5);
      col += run;
    }
  }
}

export async function renderWelcomeScreen(sources: WelcomeScreenSources): Promise<Buffer> {
  const { design } = sources;
  const canvas = createCanvas(STAGE_WIDTH, STAGE_HEIGHT);
  const ctx = canvas.getContext('2d');

  // The window and what is in it.
  const win = { x: px(design.window.left, STAGE_WIDTH), y: px(design.window.top, STAGE_HEIGHT), w: px(design.window.width, STAGE_WIDTH), h: px(design.window.height, STAGE_HEIGHT) };
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip();
  if (sources.windowPicture) drawCover(ctx, await loadImage(sources.windowPicture), win.x, win.y, win.w, win.h);
  else drawStandIn(ctx, win.x, win.y, win.w, win.h, sources.colours);
  if (sources.frame) ctx.drawImage((await loadImage(sources.frame)) as never, win.x, win.y, win.w, win.h);
  ctx.restore();

  // The overlay over it, then the QR code and the texts.
  ctx.drawImage((await loadImage(sources.overlay)) as never, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  if (design.qr) drawQr(ctx, design.qr.url, design.qr.color, px(design.qr.x, STAGE_WIDTH), px(design.qr.y, STAGE_HEIGHT), px(design.qr.size, STAGE_WIDTH));

  for (const text of design.texts ?? []) {
    const left = px(text.x, STAGE_WIDTH);
    const width = px(text.width, STAGE_WIDTH);
    let size = px(text.size, STAGE_HEIGHT);
    if (text.fit) {
      // One line that fills its box, as on the live stage (components/slideshow/ScreenDesignLayers.tsx): measure it at a reference size, scale by box over line (`size` is not used).
      ctx.font = `700 ${FIT_REFERENCE_PX}px ${sources.fontStack}`;
      size = fitSize(ctx.measureText(text.text).width, FIT_REFERENCE_PX, width, px(FIT_MAX_SIZE, STAGE_HEIGHT));
    }
    ctx.font = `700 ${size}px ${sources.fontStack}`;
    ctx.fillStyle = text.color && HEX.test(text.color) ? text.color : CAMERA_STAGE_WHITE;
    ctx.textAlign = text.align;
    ctx.textBaseline = 'middle';
    // The stage's soft shadow: 0.3% of the height down, 0.8% blur, 35% black.
    ctx.shadowColor = `${CAMERA_STAGE_BLACK}59`;
    ctx.shadowOffsetY = px(0.3, STAGE_HEIGHT);
    ctx.shadowBlur = px(0.8, STAGE_HEIGHT);
    const x = text.align === 'left' ? left : text.align === 'right' ? left + width : left + width / 2;
    // The stage's line box is 1.15 times the size, the text in the middle of it.
    ctx.fillText(text.text, x, px(text.y, STAGE_HEIGHT) + size * 0.575);
  }
  return canvas.toBuffer('image/png');
}
