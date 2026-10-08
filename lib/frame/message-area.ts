/**
 * The message area of a frame (camera#366): where a message is written on a text-free frame, in pixels of the 1920x1080 frame, the colour of the message,
 * and the boxes the live view shows as territories (the bands of the frame, say). A library frame that has one can carry the messages of an event
 * (the event's messages choose their frame); a frame without one is a complete frame the guest picks. The same shape `frameDesign.base` holds today
 * (lib/frame/base.ts), so the designers' frames of an event move into the library unchanged. Pure and client-safe.
 */

import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH } from './layout';

export interface MessageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MessageArea {
  /** Where the message is written, in pixels of the 1920x1080 frame; the text is centred in it and shrunk to fit its width. */
  messageBox: MessageBox;
  /** Hex colour of the message; white when omitted. */
  messageColor?: string;
  /** Boxes the live view shows as territories. */
  layers?: Array<{ id: 'header' | 'footer' } & MessageBox>;
}

export const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** A box inside a frame of `width` x `height`, or null. */
export function parseBox(value: unknown, width: number = DEFAULT_FRAME_WIDTH, height: number = DEFAULT_FRAME_HEIGHT): MessageBox | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  const x = num(b.x, 0, width), y = num(b.y, 0, height), w = num(b.width, 1, width), h = num(b.height, 1, height);
  return x === null || y === null || w === null || h === null || x + w > width + 0.01 || y + h > height + 0.01 ? null : { x, y, width: w, height: h };
}

/** The message area from stored or submitted data, or null when it is not usable. Unknown fields are dropped. */
export function parseMessageArea(value: unknown): MessageArea | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const messageBox = parseBox(v.messageBox);
  if (!messageBox) return null;
  const out: MessageArea = { messageBox };
  if (typeof v.messageColor === 'string' && v.messageColor !== '') {
    if (!HEX_COLOUR.test(v.messageColor)) return null;
    out.messageColor = v.messageColor;
  }
  if (Array.isArray(v.layers)) {
    const layers: NonNullable<MessageArea['layers']> = [];
    for (const raw of v.layers.slice(0, 4)) {
      const l = (raw ?? {}) as Record<string, unknown>;
      const b = parseBox(l);
      if ((l.id === 'header' || l.id === 'footer') && b) layers.push({ id: l.id, ...b });
    }
    if (layers.length) out.layers = layers;
  }
  return out;
}
