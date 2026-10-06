/**
 * Draws a reframe view onto a canvas (camera#209). The same function renders the on-screen
 * preview and the final cropped image, so what the fan sees is what is produced. DOM only; the
 * geometry lives in reframe.ts and is unit-tested there.
 */

import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import type { ViewBox } from './reframe';

/** Width of the scratch canvas the backdrop is blurred through. */
const BACKDROP_WIDTH = 48;

export interface RenderOptions {
  /** Mirror the result horizontally (front camera): the original itself is never mirrored. */
  mirrored: boolean;
  /** The frame overlay, stretched over the whole canvas; omitted for the frame-less crop. */
  frame?: CanvasImageSource | null;
}

const backdropCache = new WeakMap<object, { width: number; height: number; canvas: HTMLCanvasElement }>();

/**
 * A cheap blur that works in every browser (canvas `filter` is not supported everywhere): the
 * image is cover-fitted into a tiny scratch canvas and scaled back up with smoothing.
 */
function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number
): void {
  const smallWidth = BACKDROP_WIDTH;
  const smallHeight = Math.max(1, Math.round((smallWidth * height) / width));

  let entry = backdropCache.get(source as object);
  if (!entry || entry.width !== smallWidth || entry.height !== smallHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = smallWidth;
    canvas.height = smallHeight;
    const small = canvas.getContext('2d');
    if (!small) return;
    const scale = Math.max(smallWidth / sourceWidth, smallHeight / sourceHeight);
    small.imageSmoothingQuality = 'high';
    small.drawImage(
      source,
      (smallWidth - sourceWidth * scale) / 2,
      (smallHeight - sourceHeight * scale) / 2,
      sourceWidth * scale,
      sourceHeight * scale
    );
    entry = { width: smallWidth, height: smallHeight, canvas };
    backdropCache.set(source as object, entry);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(entry.canvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);
}

/** Returns false when the canvas cannot be drawn on. */
export function renderReframe(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  box: ViewBox,
  options: RenderOptions
): boolean {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return false;

  const width = canvas.width;
  const height = canvas.height;
  const scale = width / box.width;
  const destX = -box.x * scale;
  const destY = -box.y * scale;
  const destWidth = sourceWidth * scale;
  const destHeight = sourceHeight * scale;
  const coversCanvas =
    destX <= 0.5 && destY <= 0.5 && destX + destWidth >= width - 0.5 && destY + destHeight >= height - 0.5;

  ctx.fillStyle = CAMERA_STAGE_WHITE;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  if (options.mirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  if (!coversCanvas) {
    drawBackdrop(ctx, source, sourceWidth, sourceHeight, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
  ctx.restore();

  if (options.frame) {
    ctx.drawImage(options.frame, 0, 0, width, height);
  }
  return true;
}
