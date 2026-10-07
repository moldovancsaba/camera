/**
 * A frame made from the designers' picture (camera#311): a text-free, transparent 1920x1080 frame (header and footer bands, crest, ribbon…) with
 * the message of each variant written into one box in the event's own font, the font of its messmass report style (owner, 2026-10-07). The
 * pictures are inputs only: every variant is drawn here and stored like any other generated frame, so a guest's photo records an image of this
 * project's own store. Without a base the frame is the generated layout (lib/frame/layout.ts) as before.
 * Server side only (@napi-rs/canvas); `parseFrameBase` and `fitMessageSize` are pure and unit-tested.
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import type { ResolvedFont } from './fonts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, type LayerId } from './layout';

export interface FrameBaseImage {
  /** Names the colourway, e.g. `pink`; used by `messageImages`. */
  key: string;
  /** https; the picture is fetched by the renderer. */
  imageUrl: string;
}

export interface FrameBase {
  /** One text-free frame per colourway; the first one is used for a message that names none. */
  images: FrameBaseImage[];
  /** Which image a message uses, by the message text; a message that is not listed uses the first image. */
  messageImages?: Record<string, string>;
  /** Where the message is written, in pixels of the 1920x1080 frame; the text is centred in it and shrunk to fit its width. */
  messageBox: { x: number; y: number; width: number; height: number };
  /** Hex colour of the message; white when omitted. */
  messageColor?: string;
  /** Boxes the live view shows as territories (the bands of the frame, say). */
  layers?: Array<{ id: Extract<LayerId, 'header' | 'footer'>; x: number; y: number; width: number; height: number }>;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const KEY = /^[A-Za-z0-9_-]{1,24}$/;
const MAX_IMAGES = 6;
/** The first guess for the size of the message: this much of the box height; it is only ever made smaller to fit the width. */
const MESSAGE_SIZE_OF_BOX = 0.8;

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

function box(value: unknown, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  const x = num(b.x, 0, width), y = num(b.y, 0, height), w = num(b.width, 1, width), h = num(b.height, 1, height);
  return x === null || y === null || w === null || h === null || x + w > width + 0.01 || y + h > height + 0.01 ? null : { x, y, width: w, height: h };
}

/** The base from stored data, or null when it is not usable (then the event keeps the generated layout). */
export function parseFrameBase(value: unknown): FrameBase | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.images) || v.images.length === 0 || v.images.length > MAX_IMAGES) return null;
  const images: FrameBaseImage[] = [];
  for (const raw of v.images) {
    const i = (raw ?? {}) as Record<string, unknown>;
    if (typeof i.key !== 'string' || !KEY.test(i.key) || typeof i.imageUrl !== 'string' || i.imageUrl.length > 1000) return null;
    try {
      const url = new URL(i.imageUrl);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
    } catch {
      return null;
    }
    images.push({ key: i.key, imageUrl: i.imageUrl });
  }
  const messageBox = box(v.messageBox, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT);
  if (!messageBox) return null;
  const out: FrameBase = { images, messageBox };
  if (v.messageImages && typeof v.messageImages === 'object') {
    const keys = new Set(images.map((i) => i.key));
    const map: Record<string, string> = {};
    for (const [text, key] of Object.entries(v.messageImages as Record<string, unknown>)) if (typeof key === 'string' && keys.has(key)) map[text] = key;
    if (Object.keys(map).length) out.messageImages = map;
  }
  if (typeof v.messageColor === 'string' && HEX.test(v.messageColor)) out.messageColor = v.messageColor;
  if (Array.isArray(v.layers)) {
    const layers: NonNullable<FrameBase['layers']> = [];
    for (const raw of v.layers.slice(0, 4)) {
      const l = (raw ?? {}) as Record<string, unknown>;
      const b = box(l, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT);
      if ((l.id === 'header' || l.id === 'footer') && b) layers.push({ id: l.id, ...b });
    }
    if (layers.length) out.layers = layers;
  }
  return out;
}

/** The image a message is drawn on. */
export function baseImageFor(base: FrameBase, message: string | null): FrameBaseImage {
  const key = message ? base.messageImages?.[message] : undefined;
  return base.images.find((i) => i.key === key) ?? base.images[0];
}

/**
 * The font size of a message: a fixed share of the box height, made smaller when the text is wider than the box. Text width is linear in the
 * font size, so one probe size gives the size that fits.
 */
export function fitMessageSize(measure: (text: string, size: number) => number, text: string, boxWidth: number, boxHeight: number): number {
  const wanted = boxHeight * MESSAGE_SIZE_OF_BOX;
  const probe = measure(text, wanted);
  return probe <= boxWidth || probe <= 0 ? wanted : Math.max(1, (wanted * boxWidth) / probe);
}

export interface RenderedBaseFrame {
  png: Buffer;
  width: number;
  height: number;
  layers: Array<{ id: LayerId; x: number; y: number; width: number; height: number }>;
}

/** Draws the picture and the message. The picture is stretched to 1920x1080 (the frame size); the message is centred in its box. */
export async function renderBaseFrame(input: { base: FrameBase; imageBytes: Buffer; message: string | null; font: ResolvedFont }): Promise<RenderedBaseFrame> {
  const { base, imageBytes, message, font } = input;
  const width = DEFAULT_FRAME_WIDTH;
  const height = DEFAULT_FRAME_HEIGHT;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(imageBytes), 0, 0, width, height);

  if (message) {
    const { messageBox: b } = base;
    const measure = (text: string, size: number) => {
      ctx.font = `700 ${size}px ${font.stack}`;
      return ctx.measureText(text).width;
    };
    const size = fitMessageSize(measure, message, b.width, b.height);
    ctx.font = `700 ${size}px ${font.stack}`;
    ctx.fillStyle = base.messageColor ?? CAMERA_STAGE_WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, b.x + b.width / 2, b.y + b.height / 2);
  }
  return { png: canvas.toBuffer('image/png'), width, height, layers: (base.layers ?? []).map((l) => ({ ...l })) };
}
