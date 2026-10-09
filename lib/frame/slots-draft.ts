/**
 * What the slots editor of the admin edits (docs/FRAME_SLOTS_PLAN.md, issue 502): one row per position with the text slot and the picture slot as plain form values, and the
 * conversion to and from the stored `FrameSlots`. Pure, so the editor's rules are unit-tested without a browser. The editor sends the result to the server, which checks it again
 * (`parseSlots`); nothing here is trusted.
 */

import { CORNER_PICTURE_SIZE, DEFAULT_SLOTS, SLOT_POSITIONS, isCentre, type FrameSlots, type PictureSource, type SlotPosition, type TextSource } from './slots';

export interface PositionDraft {
  position: SlotPosition;
  textSource: TextSource | 'off';
  /** The words of an own text. */
  customText: string;
  /** #rrggbb, or empty for the heading colour of the style. */
  textColour: string;
  pictureSource: PictureSource | 'off';
  /** The addresses of the pictures of a `picture` slot, in order; an empty string is a picture still to choose. */
  images: string[];
  /** Which picture each message uses: the message text as in the event's list to the index in `images`. */
  byMessage: Record<string, number>;
  /** A corner picture's size in percent of the frame, as typed; empty for the default. */
  size: string;
}

const emptyRow = (position: SlotPosition): PositionDraft => ({ position, textSource: 'off', customText: '', textColour: '', pictureSource: 'off', images: [], byMessage: {}, size: '' });

export const imageKey = (index: number) => `img${index + 1}`;

/** The rows for stored slots (the default frame's slots when the event has none). */
export function slotsToDraft(slots: FrameSlots | undefined): PositionDraft[] {
  const source = slots ?? DEFAULT_SLOTS;
  return SLOT_POSITIONS.map((position) => {
    const row = emptyRow(position);
    const text = source.text[position];
    if (text) {
      row.textSource = text.source;
      row.customText = text.text ?? '';
      row.textColour = text.colour ?? '';
    }
    const picture = source.picture[position];
    if (picture) {
      row.pictureSource = picture.source;
      row.images = (picture.images ?? []).map((image) => image.imageUrl);
      const keys = (picture.images ?? []).map((image) => image.key);
      row.byMessage = Object.fromEntries(Object.entries(picture.byMessage ?? {}).flatMap(([message, key]) => (keys.includes(key) ? [[message, keys.indexOf(key)]] : [])));
      row.size = picture.size !== undefined ? String(picture.size) : '';
    }
    return row;
  });
}

/** The slots as the server takes them. Rows that are off are left out; an empty picture address is left out of a `picture` slot (the server then asks for a picture). */
export function draftToSlots(rows: readonly PositionDraft[]): { text: Record<string, unknown>; picture: Record<string, unknown> } {
  const text: Record<string, unknown> = {};
  const picture: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.textSource !== 'off') {
      text[row.position] = { source: row.textSource, ...(row.textSource === 'custom' ? { text: row.customText } : {}), ...(row.textColour.trim() ? { colour: row.textColour.trim() } : {}) };
    }
    if (row.pictureSource === 'off') continue;
    if (row.pictureSource !== 'picture') {
      picture[row.position] = { source: row.pictureSource, ...(!isCentre(row.position) && row.size.trim() ? { size: row.size.trim() } : {}) };
      continue;
    }
    const images = row.images.map((imageUrl, index) => ({ imageUrl: imageUrl.trim(), key: imageKey(index) })).filter((image) => image.imageUrl !== '');
    const kept = row.images.flatMap((imageUrl, index) => (imageUrl.trim() ? [index] : []));
    // A message maps to the picture's new place among the pictures that are chosen.
    const byMessage = Object.fromEntries(Object.entries(row.byMessage).flatMap(([message, index]) => (kept.includes(index) ? [[message, imageKey(kept.indexOf(index))]] : [])));
    picture[row.position] = {
      source: 'picture',
      images: images.map((image, index) => ({ ...image, key: imageKey(index) })),
      ...(Object.keys(byMessage).length > 0 ? { byMessage } : {}),
      ...(!isCentre(row.position) && row.size.trim() ? { size: row.size.trim() } : {}),
    };
  }
  return { text, picture };
}

/** What a row says in a few words, for the summary line of its card. */
export function rowSummary(row: PositionDraft): string {
  const parts: string[] = [];
  if (row.textSource !== 'off') parts.push(`text: ${TEXT_LABEL[row.textSource]}`);
  if (row.pictureSource !== 'off') parts.push(`picture: ${row.pictureSource === 'picture' ? `${row.images.filter(Boolean).length || 'no'} picture${row.images.filter(Boolean).length === 1 ? '' : 's'}` : PICTURE_LABEL[row.pictureSource]}`);
  return parts.length > 0 ? parts.join(' · ') : 'nothing';
}

export const TEXT_LABEL: Record<TextSource, string> = {
  teams: 'team 1 over team 2',
  team1: 'team 1',
  team2: 'team 2',
  title: 'event title',
  message: 'fan supporter message',
  custom: 'own text',
};

export const PICTURE_LABEL: Record<PictureSource, string> = {
  partnerLogo: 'partner logo',
  bar: 'generated message background',
  picture: 'a picture',
};

export const POSITION_LABEL: Record<SlotPosition, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

export const DEFAULT_CORNER_SIZE = CORNER_PICTURE_SIZE;
