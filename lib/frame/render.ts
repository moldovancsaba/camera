/**
 * Draws the generated default frame as a transparent PNG (docs/DEFAULT_FRAME_PLAN.md, camera#235). The geometry and the
 * text fitting come from lib/frame/layout.ts, the same numbers the live-view territories use; this file only draws.
 * Server side only (@napi-rs/canvas).
 */

import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { cssColour } from '@/lib/gds/tokens/color-css';
import type { FrameContext } from './context';
import { EMOJI_ALIAS, ensureEmojiFont, type ResolvedFont } from './fonts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, layoutFrame, type FrameLayout } from './layout';

/** Bump when the drawing changes, so stored images are regenerated. */
export const FRAME_RENDER_VERSION = 4;

export interface RenderedFrame {
  png: Buffer;
  layout: FrameLayout;
  logo: 'drawn' | 'emoji' | 'none' | 'failed';
}

const EMOJI_SIZE = 384;

/**
 * An emoji as a picture of its own size: drawn large with the colour emoji font and cropped to what is drawn, so a flag or a
 * motorbike (wider than tall) keeps its shape in the logo box like any other logo. Null when nothing was drawn.
 */
export function drawEmojiLogo(emoji: string): Canvas | null {
  ensureEmojiFont(emoji);
  const canvas = createCanvas(EMOJI_SIZE, EMOJI_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.font = `${Math.round(EMOJI_SIZE * 0.78)}px "${EMOJI_ALIAS}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, EMOJI_SIZE / 2, EMOJI_SIZE / 2);

  const { data } = ctx.getImageData(0, 0, EMOJI_SIZE, EMOJI_SIZE);
  let minX = EMOJI_SIZE;
  let minY = EMOJI_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < EMOJI_SIZE; y += 1) {
    for (let x = 0; x < EMOJI_SIZE; x += 1) {
      if (data[(y * EMOJI_SIZE + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = createCanvas(width, height);
  cropped.getContext('2d').drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
  return cropped;
}

export async function renderFrame(input: {
  context: FrameContext;
  message: string | null;
  logoBytes: Buffer | null;
  /** The event's emoji, drawn as the logo when there is no logo to draw (camera#274). */
  emoji?: string | null;
  font: ResolvedFont;
  width?: number;
  height?: number;
}): Promise<RenderedFrame> {
  const width = input.width ?? DEFAULT_FRAME_WIDTH;
  const height = input.height ?? DEFAULT_FRAME_HEIGHT;
  const { context, font } = input;
  const { heroBackground, headingColor } = context.style;

  ensureEmojiFont([input.message ?? '', context.event.name, context.event.homeTeam?.name ?? '', context.event.visitorTeam?.name ?? '', input.emoji ?? ''].join(' '));

  let logo: Awaited<ReturnType<typeof loadImage>> | Canvas | null = null;
  let logoState: RenderedFrame['logo'] = context.partner?.logoUrl ? 'failed' : 'none';
  if (input.logoBytes) {
    try {
      logo = await loadImage(input.logoBytes);
      logoState = 'drawn';
    } catch {
      logo = null;
    }
  }
  // No logo to draw (the partner has none, or it could not be had): the event's emoji takes its place.
  if (!logo && input.emoji) {
    logo = drawEmojiLogo(input.emoji);
    if (logo && logoState === 'none') logoState = 'emoji';
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const measure = (text: string, size: number) => {
    ctx.font = `700 ${size}px ${font.stack}`;
    return ctx.measureText(text).width;
  };

  const layout = layoutFrame({
    width,
    height,
    logo: logo ? { width: logo.width, height: logo.height } : null,
    home: context.event.homeTeam?.name,
    visitor: context.event.visitorTeam?.name,
    eventName: context.event.name,
    message: input.message,
    measure,
  });

  // The bar, then the 1% line above it (the sides and the bottom of the frame clip it away).
  ctx.fillStyle = cssColour(heroBackground);
  ctx.fillRect(layout.bar.x, layout.bar.y, layout.bar.width, layout.bar.height);
  ctx.fillStyle = cssColour(headingColor);
  ctx.fillRect(layout.barLine.x, layout.barLine.y, layout.barLine.width, layout.barLine.height);

  // The logo as it is: its own transparency, nothing behind it, nothing removed (an emoji in its place is drawn the same way).
  if (logo && layout.logo) ctx.drawImage(logo, layout.logo.x, layout.logo.y, layout.logo.width, layout.logo.height);

  ctx.fillStyle = cssColour(headingColor);
  if (layout.teams) {
    ctx.font = `700 ${layout.teams.fontSize}px ${font.stack}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    layout.teams.lines.forEach((line, i) => ctx.fillText(line, layout.teams!.rect.x, layout.teams!.rect.y + i * layout.teams!.lineHeight));
  }
  if (layout.message) {
    ctx.font = `700 ${layout.message.fontSize}px ${font.stack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layout.message.text, layout.message.rect.x + layout.message.rect.width / 2, layout.message.rect.y + layout.message.rect.height / 2);
  }

  return { png: canvas.toBuffer('image/png'), layout, logo: logoState };
}
