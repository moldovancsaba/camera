/**
 * The slots of a generated frame (docs/FRAME_SLOTS_PLAN.md, issue 502; the client's request of 2026-10-09): six optional text slots and six optional picture slots at the same
 * six positions. This file is the model: the types, the default four slots, the defensive parse of what the admin sends, and which picture a message uses. Pure (no canvas, no
 * network), so it is unit-tested; the geometry is in slot-layout.ts and the drawing in render.ts.
 */

import { isAllowedLogoUrl } from './logo';
import { MAX_FRAME_MESSAGES, MAX_FRAME_MESSAGE_LENGTH } from './messages';

export const SLOT_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type SlotPosition = (typeof SLOT_POSITIONS)[number];

/** The centre positions are bars (full width, on the top or the bottom edge) when they hold a picture. */
export const isCentre = (position: SlotPosition): boolean => position === 'top-center' || position === 'bottom-center';
export const isTop = (position: SlotPosition): boolean => position.startsWith('top');

export const TEXT_SOURCES = ['teams', 'team1', 'team2', 'title', 'message', 'custom'] as const;
export type TextSource = (typeof TEXT_SOURCES)[number];

/** Each of these may be in one place only; `custom` may be used several times. */
const SINGLE_TEXT: readonly TextSource[] = ['teams', 'team1', 'team2', 'title', 'message'];

export const PICTURE_SOURCES = ['partnerLogo', 'bar', 'picture'] as const;
export type PictureSource = (typeof PICTURE_SOURCES)[number];

/** What a picture slot can show at a position: a corner takes the partner logo or a picture, a centre (a bar) the generated bar or a picture. */
export const pictureSourcesAt = (position: SlotPosition): readonly PictureSource[] => (isCentre(position) ? ['bar', 'picture'] : ['partnerLogo', 'picture']);

export const SLOT_TEXT_MAX = 120;
export const SLOT_IMAGES_MAX = 6;
export const CORNER_PICTURE_SIZE = 15;
export const CORNER_PICTURE_SIZE_MIN = 5;
export const CORNER_PICTURE_SIZE_MAX = 40;

export interface TextSlot {
  source: TextSource;
  /** The words of a `custom` slot. */
  text?: string;
  /** #rgb, #rrggbb or #rrggbbaa; the heading colour of the messmass style when omitted. */
  colour?: string;
}

export interface SlotImage {
  /** Names the picture, e.g. `blue`; used by `byMessage`. */
  key: string;
  imageUrl: string;
}

export interface PictureSlot {
  source: PictureSource;
  /** The pictures of a `picture` slot (at most six); the first is used by a message that names none. */
  images?: SlotImage[];
  /** Which picture a message uses, by the message text as it stands in the event's list: message to image key. */
  byMessage?: Record<string, string>;
  /** A corner picture fits a box of this share of the frame (percent); 15 when omitted. */
  size?: number;
}

export interface FrameSlots {
  text: Partial<Record<SlotPosition, TextSlot>>;
  picture: Partial<Record<SlotPosition, PictureSlot>>;
}

/** The default frame as four slots: the teams top left, the fan message bottom centre, the partner logo top right, the generated message background bottom centre. */
export const DEFAULT_SLOTS: FrameSlots = {
  text: { 'top-left': { source: 'teams' }, 'bottom-center': { source: 'message' } },
  picture: { 'top-right': { source: 'partnerLogo' }, 'bottom-center': { source: 'bar' } },
};

const KEY = /^[A-Za-z0-9_-]{1,24}$/;
const COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

export type SlotsCheck = { ok: true; slots: FrameSlots } | { ok: false; error: string };

const where = (kind: 'text' | 'picture', position: string) => `The ${position.replace('-', ' ')} ${kind} slot`;

function parseTextSlot(raw: unknown, position: SlotPosition): TextSlot | string {
  const slot = record(raw);
  if (!slot) return `${where('text', position)} is not valid.`;
  const source = slot.source;
  if (typeof source !== 'string' || !(TEXT_SOURCES as readonly string[]).includes(source)) return `${where('text', position)} has an unknown source.`;
  const out: TextSlot = { source: source as TextSource };
  if (source === 'custom') {
    const text = typeof slot.text === 'string' ? slot.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) return `${where('text', position)} needs its text.`;
    if (Array.from(text).length > SLOT_TEXT_MAX) return `${where('text', position)} is longer than ${SLOT_TEXT_MAX} characters.`;
    out.text = text;
  }
  if (slot.colour !== undefined && slot.colour !== null && slot.colour !== '') {
    if (typeof slot.colour !== 'string' || !COLOUR.test(slot.colour)) return `${where('text', position)} has a colour that is not #rrggbb.`;
    out.colour = slot.colour.toLowerCase();
  }
  return out;
}

function parsePictureSlot(raw: unknown, position: SlotPosition): PictureSlot | string {
  const slot = record(raw);
  if (!slot) return `${where('picture', position)} is not valid.`;
  const source = slot.source;
  if (typeof source !== 'string' || !(PICTURE_SOURCES as readonly string[]).includes(source)) return `${where('picture', position)} has an unknown source.`;
  if (!pictureSourcesAt(position).includes(source as PictureSource)) {
    return `${where('picture', position)} cannot show ${source === 'bar' ? 'the generated bar' : source === 'partnerLogo' ? 'the partner logo' : 'a picture'} here.`;
  }
  const out: PictureSlot = { source: source as PictureSource };
  if (source === 'picture') {
    if (!Array.isArray(slot.images) || slot.images.length === 0) return `${where('picture', position)} needs a picture.`;
    if (slot.images.length > SLOT_IMAGES_MAX) return `${where('picture', position)} has more than ${SLOT_IMAGES_MAX} pictures.`;
    const images: SlotImage[] = [];
    for (const item of slot.images) {
      const image = record(item);
      if (!image || typeof image.key !== 'string' || !KEY.test(image.key) || typeof image.imageUrl !== 'string' || image.imageUrl.length > 1000 || !isAllowedLogoUrl(image.imageUrl)) {
        return `${where('picture', position)} has a picture that is not from the app's own storage (https).`;
      }
      if (images.some((existing) => existing.key === image.key)) return `${where('picture', position)} has two pictures with the key ${image.key}.`;
      images.push({ key: image.key, imageUrl: image.imageUrl });
    }
    out.images = images;
    if (slot.byMessage !== undefined && slot.byMessage !== null) {
      const map = record(slot.byMessage);
      if (!map) return `${where('picture', position)} has a message list that is not valid.`;
      const keys = new Set(images.map((image) => image.key));
      const byMessage: Record<string, string> = {};
      for (const [message, key] of Object.entries(map)) {
        if (typeof key !== 'string' || !keys.has(key) || message.length === 0 || Array.from(message).length > MAX_FRAME_MESSAGE_LENGTH) {
          return `${where('picture', position)} sends a message to a picture it does not have.`;
        }
        byMessage[message] = key;
      }
      if (Object.keys(byMessage).length > MAX_FRAME_MESSAGES) return `${where('picture', position)} maps more than ${MAX_FRAME_MESSAGES} messages.`;
      if (Object.keys(byMessage).length > 0) out.byMessage = byMessage;
    }
  }
  if (!isCentre(position) && slot.size !== undefined && slot.size !== null && slot.size !== '') {
    const size = Number(slot.size);
    if (!Number.isFinite(size) || size < CORNER_PICTURE_SIZE_MIN || size > CORNER_PICTURE_SIZE_MAX) {
      return `${where('picture', position)} has a size outside ${CORNER_PICTURE_SIZE_MIN} to ${CORNER_PICTURE_SIZE_MAX} percent.`;
    }
    if (Math.round(size * 10) / 10 !== CORNER_PICTURE_SIZE) out.size = Math.round(size * 10) / 10;
  }
  return out;
}

/**
 * The slots as the admin sends them, checked and normalised, or the first thing that is wrong in words for the editor. Unknown positions, unknown sources, a picture that is not from
 * the app's own storage, a source in a place it cannot be, and a text that may only appear once appearing twice are all refused. A frame with no slot at all is refused too (it would
 * be an empty frame: turn the slots off instead).
 */
export function parseSlots(input: unknown): SlotsCheck {
  const root = record(input);
  if (!root) return { ok: false, error: 'The slots are not valid.' };
  const text: FrameSlots['text'] = {};
  const picture: FrameSlots['picture'] = {};
  for (const [kind, target] of [['text', text], ['picture', picture]] as const) {
    const group = root[kind] === undefined || root[kind] === null ? {} : record(root[kind]);
    if (!group) return { ok: false, error: `The ${kind} slots are not valid.` };
    for (const [position, raw] of Object.entries(group)) {
      if (raw === null || raw === undefined) continue;
      if (!(SLOT_POSITIONS as readonly string[]).includes(position)) return { ok: false, error: `${position} is not a position of a frame.` };
      const parsed = kind === 'text' ? parseTextSlot(raw, position as SlotPosition) : parsePictureSlot(raw, position as SlotPosition);
      if (typeof parsed === 'string') return { ok: false, error: parsed };
      (target as Record<string, unknown>)[position] = parsed;
    }
  }
  for (const source of SINGLE_TEXT) {
    const used = SLOT_POSITIONS.filter((position) => text[position]?.source === source);
    if (used.length > 1) return { ok: false, error: `${source === 'message' ? 'The fan message' : source === 'title' ? 'The event title' : `The ${source}`} can be in one place only.` };
  }
  if (SLOT_POSITIONS.filter((position) => picture[position]?.source === 'partnerLogo').length > 1) return { ok: false, error: 'The partner logo can be in one place only.' };
  if (Object.keys(text).length === 0 && Object.keys(picture).length === 0) return { ok: false, error: 'Switch on at least one slot, or go back to the default frame.' };
  return { ok: true, slots: { text, picture } };
}

/** The same slots, whatever the order of the keys (so a slot set that equals what an event follows can be stored as "no slots" and keep every stored image). */
export function sameSlots(a: FrameSlots, b: FrameSlots): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The same slots as the default frame has. */
export const isDefaultSlots = (slots: FrameSlots): boolean => sameSlots(slots, DEFAULT_SLOTS);

function canonical(slots: FrameSlots): unknown {
  const order = (group: Partial<Record<SlotPosition, unknown>>) => SLOT_POSITIONS.filter((position) => group[position]).map((position) => [position, group[position]]);
  return { text: order(slots.text), picture: order(slots.picture) };
}

/** The picture each `picture` slot draws for a message (its text as it stands in the event's list): the one the message is mapped to, else the first. */
export function resolveSlotPictures(slots: FrameSlots, template: string | null): Partial<Record<SlotPosition, SlotImage>> {
  const out: Partial<Record<SlotPosition, SlotImage>> = {};
  for (const position of SLOT_POSITIONS) {
    const slot = slots.picture[position];
    if (slot?.source !== 'picture' || !slot.images?.length) continue;
    const key = template ? slot.byMessage?.[template] : undefined;
    out[position] = slot.images.find((image) => image.key === key) ?? slot.images[0];
  }
  return out;
}

/** The slots a message needs to be drawn with, as a stable value for the key of its image: the slots with each picture slot reduced to the picture the message uses. */
export function slotsForMessage(slots: FrameSlots, template: string | null): unknown {
  const pictures = resolveSlotPictures(slots, template);
  return {
    text: slots.text,
    picture: Object.fromEntries(
      SLOT_POSITIONS.filter((position) => slots.picture[position]).map((position) => {
        const slot = slots.picture[position]!;
        return [position, slot.source === 'picture' ? { source: slot.source, image: pictures[position], size: slot.size } : slot];
      })
    ),
  };
}
