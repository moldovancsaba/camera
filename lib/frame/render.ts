/**
 * Draws the generated default frame as a transparent PNG (docs/DEFAULT_FRAME_PLAN.md, camera#235). The geometry and the
 * text fitting come from lib/frame/layout.ts, the same numbers the live-view territories use; this file only draws.
 * Server side only (@napi-rs/canvas).
 */

import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import { cssColour } from '@/lib/gds/tokens/color-css';
import type { FrameContext } from './context';
import { EMOJI_ALIAS, ensureEmojiFont, type ResolvedFont } from './fonts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, layerBoxes, layoutFrame, type FrameLayout, type LayerId } from './layout';
import { layoutSlots, slotLayerBoxes, type SlotLayout } from './slot-layout';
import { SLOT_POSITIONS, type FrameSlots, type SlotPosition } from './slots';

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

export interface FrameInput {
  context: FrameContext;
  message: string | null;
  logoBytes: Buffer | null;
  /** The event's emoji, drawn as the logo when there is no logo to draw (camera#274). */
  emoji?: string | null;
  font: ResolvedFont;
  width?: number;
  height?: number;
}

/** The logo (or the event's emoji), the canvas and the text measure that every generated frame starts from: shared by the default layout and by slots. */
async function prepareAssets(input: FrameInput) {
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

  return { canvas, ctx, measure, logo, logoState, width, height, headingColor, heroBackground };
}

/** The layout of the generated frame for one message, with the logo (or the event's emoji) it would draw and the context to draw on: shared by the drawing and by the mask. */
async function prepareFrame(input: FrameInput) {
  const assets = await prepareAssets(input);
  const { context } = input;
  const { logo, width, height, measure } = assets;
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
  return { ...assets, layout };
}

/**
 * The dark area of the generated frame for one message as layer boxes (the logo, the teams, the bar with its line, the message), without drawing anything: the mask a design that
 * carries messages can borrow (`FrameDesign.darkArea`).
 */
export async function generatedLayers(input: FrameInput): Promise<Array<{ id: LayerId; x: number; y: number; width: number; height: number }>> {
  const { layout } = await prepareFrame(input);
  return layerBoxes(layout).map(({ id, rect }) => ({ id, ...rect }));
}

export async function renderFrame(input: FrameInput): Promise<RenderedFrame> {
  const { canvas, ctx, layout, logo, logoState, heroBackground, headingColor } = await prepareFrame(input);
  const { font } = input;

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


export interface SlotFrameInput extends FrameInput {
  slots: FrameSlots;
  /** The bytes of the picture each `picture` slot draws for this message (chosen by lib/frame/slots.ts `resolveSlotPictures`, fetched by the caller). */
  pictureBytes: Partial<Record<SlotPosition, Buffer>>;
}

export interface RenderedSlotFrame {
  png: Buffer;
  layout: SlotLayout;
  logo: RenderedFrame['logo'];
}

async function prepareSlotFrame(input: SlotFrameInput) {
  const assets = await prepareAssets(input);
  const { context } = input;
  const images: Partial<Record<SlotPosition, Image>> = {};
  const sizes: Partial<Record<SlotPosition, { width: number; height: number }>> = {};
  for (const position of SLOT_POSITIONS) {
    const bytes = input.pictureBytes[position];
    if (!bytes) continue;
    try {
      const image = await loadImage(bytes);
      images[position] = image;
      sizes[position] = { width: image.width, height: image.height };
    } catch {
      // Not an image we can draw: the layout reports it as a picture that could not be drawn.
    }
  }
  const layout = layoutSlots({
    width: assets.width,
    height: assets.height,
    slots: input.slots,
    logo: assets.logo ? { width: assets.logo.width, height: assets.logo.height } : null,
    pictures: sizes,
    home: context.event.homeTeam?.name,
    visitor: context.event.visitorTeam?.name,
    eventName: context.event.name,
    message: input.message,
    measure: assets.measure,
  });
  return { ...assets, images, layout };
}

/** The dark area of a frame made of slots for one message, as layer boxes, without drawing anything. */
export async function slotLayers(input: SlotFrameInput): Promise<Array<{ id: LayerId; x: number; y: number; width: number; height: number }>> {
  const { layout } = await prepareSlotFrame(input);
  return slotLayerBoxes(layout).map(({ id, rect }) => ({ id, ...rect }));
}

/** Draws a frame from its slots (docs/FRAME_SLOTS_PLAN.md): the generated bars and the pictures first, then the texts on top. */
export async function renderSlotFrame(input: SlotFrameInput): Promise<RenderedSlotFrame> {
  const { canvas, ctx, layout, logo, logoState, images, heroBackground, headingColor } = await prepareSlotFrame(input);
  const { font } = input;

  for (const picture of layout.pictures) {
    if (picture.kind === 'bar') {
      ctx.fillStyle = cssColour(heroBackground);
      ctx.fillRect(picture.rect.x, picture.rect.y, picture.rect.width, picture.rect.height);
      if (picture.line) {
        ctx.fillStyle = cssColour(headingColor);
        ctx.fillRect(picture.line.x, picture.line.y, picture.line.width, picture.line.height);
      }
    } else if (picture.kind === 'logo') {
      if (logo) ctx.drawImage(logo, picture.rect.x, picture.rect.y, picture.rect.width, picture.rect.height);
    } else {
      const image = images[picture.position];
      if (image) ctx.drawImage(image, picture.rect.x, picture.rect.y, picture.rect.width, picture.rect.height);
    }
  }

  for (const text of layout.texts) {
    ctx.fillStyle = cssColour(text.colour ?? headingColor);
    ctx.font = `700 ${text.fontSize}px ${font.stack}`;
    if (text.oneLine) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.lines[0], text.rect.x + text.rect.width / 2, text.rect.y + text.rect.height / 2);
    } else {
      ctx.textAlign = text.align === 'right' ? 'right' : 'left';
      ctx.textBaseline = 'top';
      const x = text.align === 'right' ? text.rect.x + text.rect.width : text.rect.x;
      text.lines.forEach((line, i) => ctx.fillText(line, x, text.rect.y + i * text.lineHeight));
    }
  }

  return { png: canvas.toBuffer('image/png'), layout, logo: logoState };
}
