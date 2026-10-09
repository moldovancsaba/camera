/**
 * A picture of the frame the editor is composing (docs/FRAME_SLOTS_PLAN.md, issue 502): the draft slots drawn with one of the event's messages, exactly as the real images are, and
 * what the layout has to say about them (a text that is cut, slots that overlap, a picture that could not be drawn). Nothing is stored. A picture that cannot be fetched is not an error
 * here: it is left out and reported.
 */

import type { FrameDesign } from './context';
import { resolveFrameFont, type ResolvedFont } from './fonts';
import { fetchLogo } from './logo';
import { messageTokens, usableMessages } from './messages';
import { renderSlotFrame } from './render';
import { resolveSlotPictures, type FrameSlots, type SlotPosition } from './slots';
import { shownContext } from './variants';

export interface PreviewDeps {
  fetchLogo: (url: string) => Promise<Buffer | null>;
  fetchBaseImage: (url: string) => Promise<Buffer | null>;
  resolveFont: (style: FrameDesign['context']['style']) => Promise<ResolvedFont>;
}

const defaultDeps: PreviewDeps = { fetchLogo, fetchBaseImage: (url) => fetchLogo(url), resolveFont: (style) => resolveFrameFont(style) };

export interface SlotPreview {
  png: Buffer;
  width: number;
  height: number;
  notes: string[];
  /** The filled message that is on the picture; null when no message is usable. */
  message: string | null;
}

/** `messageIndex` is a position in the event's message list; a message that is not usable (or none given) is replaced by the first usable one. */
export async function previewSlots(design: FrameDesign, slots: FrameSlots, messageIndex: number | null, deps: PreviewDeps = defaultDeps): Promise<SlotPreview> {
  const { context } = design;
  const { shown, emoji } = shownContext(context);
  const usable = usableMessages(design.messages, messageTokens({ home: shown.event.homeTeam?.name, visitor: shown.event.visitorTeam?.name, eventName: shown.event.name }));
  const chosen = usable.find((message) => message.index === messageIndex) ?? usable[0] ?? null;
  const template = chosen ? (design.messages[chosen.index] ?? null) : null;

  const font = await deps.resolveFont(context.style);
  const logoBytes = context.partner?.logoUrl ? await deps.fetchLogo(context.partner.logoUrl) : null;
  const pictureBytes: Partial<Record<SlotPosition, Buffer>> = {};
  for (const [position, image] of Object.entries(resolveSlotPictures(slots, template)) as Array<[SlotPosition, { imageUrl: string }]>) {
    const bytes = await deps.fetchBaseImage(image.imageUrl);
    if (bytes) pictureBytes[position] = bytes;
  }
  const rendered = await renderSlotFrame({ context: shown, message: chosen?.text ?? null, logoBytes, emoji, font, slots, pictureBytes });
  return { png: rendered.png, width: rendered.layout.width, height: rendered.layout.height, notes: rendered.layout.notes, message: chosen?.text ?? null };
}
