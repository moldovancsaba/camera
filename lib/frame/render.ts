/**
 * Draws the generated default frame as a transparent PNG (docs/DEFAULT_FRAME_PLAN.md, camera#235). The geometry and the
 * text fitting come from lib/frame/layout.ts, the same numbers the live-view territories use; this file only draws.
 * Server side only (@napi-rs/canvas).
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cssColour } from '@/lib/gds/tokens/color-css';
import type { FrameContext } from './context';
import { ensureEmojiFont, type ResolvedFont } from './fonts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, layoutFrame, type FrameLayout } from './layout';

/** Bump when the drawing changes, so stored images are regenerated. */
export const FRAME_RENDER_VERSION = 2;

export interface RenderedFrame {
  png: Buffer;
  layout: FrameLayout;
  logo: 'drawn' | 'none' | 'failed';
}

export async function renderFrame(input: {
  context: FrameContext;
  message: string | null;
  logoBytes: Buffer | null;
  font: ResolvedFont;
  width?: number;
  height?: number;
}): Promise<RenderedFrame> {
  const width = input.width ?? DEFAULT_FRAME_WIDTH;
  const height = input.height ?? DEFAULT_FRAME_HEIGHT;
  const { context, font } = input;
  const { heroBackground, headingColor } = context.style;

  ensureEmojiFont([input.message ?? '', context.event.name, context.event.homeTeam?.name ?? '', context.event.visitorTeam?.name ?? ''].join(' '));

  let logo: Awaited<ReturnType<typeof loadImage>> | null = null;
  let logoState: RenderedFrame['logo'] = context.partner?.logoUrl ? 'failed' : 'none';
  if (input.logoBytes) {
    try {
      logo = await loadImage(input.logoBytes);
      logoState = 'drawn';
    } catch {
      logo = null;
    }
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

  // The logo as it is: its own transparency, nothing behind it, nothing removed.
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
