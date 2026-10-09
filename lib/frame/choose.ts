/**
 * Which layout and message a user gets under the editor's setting (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md, segment S2). One pure function set the capture page asks at every
 * step, so the order and the fallbacks are decided (and tested) in one place.
 *
 * Each of the two settings is `editor` (the editor's pick), `random` (a new draw at every photo, never the same image twice in a row) or `user` (the user chooses). When both are
 * `user`, the design comes first and the message second; a message is offered only on the designs it is written on; a change of design keeps the message if the new design offers it
 * and asks again if not. Pure and client-safe.
 */

import type { CaptureFrame, CaptureSelection, CaptureVariant } from './capture';
import { GENERATED_LAYOUT } from './selection';

/** What the user has chosen so far: a design (a layout id) and a message (its position in the message list). */
export interface Choice {
  layoutId: string | null;
  messageIndex: number | null;
}

export const NO_CHOICE: Choice = { layoutId: null, messageIndex: null };

export type SelectStep = 'select-layout' | 'select-message' | 'capture-photo';

/** The layout an image belongs to: the library frame it is written on, or the generated layout. */
export const layoutIdOf = (variant: Pick<CaptureVariant, 'frameId'>): string => variant.frameId ?? GENERATED_LAYOUT;

/** One image is the same as another when it is the same message on the same design. */
export const variantKeyOf = (variant: Pick<CaptureVariant, 'frameId' | 'index'>): string => `${layoutIdOf(variant)}|${variant.index ?? ''}`;

const withMessage = (variant: CaptureVariant): boolean => variant.index !== null && Boolean(variant.message);

/** The design the editor picked or the user chose, if the event has an image on it. */
function wantedLayout(frame: CaptureFrame, selection: CaptureSelection, choice: Choice): string | null {
  const id = selection.layout.mode === 'editor' ? selection.layout.pick : selection.layout.mode === 'user' ? choice.layoutId : null;
  return id !== null && frame.variants.some((variant) => layoutIdOf(variant) === id) ? id : null;
}

/** The message the editor picked or the user chose, if the event has an image with it. */
function wantedMessage(frame: CaptureFrame, selection: CaptureSelection, choice: Choice): number | null {
  const index = selection.message.mode === 'editor' ? selection.message.pick : selection.message.mode === 'user' ? choice.messageIndex : null;
  return index !== null && frame.variants.some((variant) => variant.index === index) ? index : null;
}

/** The distinct values of a key in order of first appearance, each with the first variant that has it. */
function distinct(variants: CaptureVariant[], keyOf: (variant: CaptureVariant) => string): CaptureVariant[] {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = keyOf(variant);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The images that fit the editor's picks and the user's choices. When nothing fits (a message not on the chosen design, a pick that is gone) the message gives way first, then the
 * design, so a photo always has an image.
 */
export function fitting(frame: CaptureFrame, choice: Choice): CaptureVariant[] {
  const selection = frame.selection;
  if (!selection) return frame.variants;
  const layout = wantedLayout(frame, selection, choice);
  const message = wantedMessage(frame, selection, choice);
  const attempts: Array<[string | null, number | null]> = [[layout, message], [layout, null], [null, message], [null, null]];
  for (const [l, m] of attempts) {
    const found = frame.variants.filter((variant) => (l === null || layoutIdOf(variant) === l) && (m === null || variant.index === m));
    if (found.length > 0) return found;
  }
  return frame.variants;
}

/**
 * The designs the user can choose between, one image of each to show it: only when the setting lets the user choose the design, and the designs offer more than one. A message the
 * editor picked limits the designs to those that carry it; a message the user chose does not (changing the design is how the user changes it).
 */
export function layoutsToChoose(frame: CaptureFrame): CaptureVariant[] {
  const selection = frame.selection;
  if (selection?.layout.mode !== 'user') return [];
  const picked = selection.message.mode === 'editor' ? selection.message.pick : null;
  const offered = picked !== null && frame.variants.some((variant) => variant.index === picked) ? frame.variants.filter((variant) => variant.index === picked) : frame.variants;
  const layouts = distinct(offered, layoutIdOf);
  return layouts.length > 1 ? layouts : [];
}

/**
 * The messages the user can choose between, one image of each: only when the setting lets the user choose the message, limited to the design the editor picked or the user chose,
 * and more than one. Images without a message are not a choice.
 */
export function messagesToChoose(frame: CaptureFrame, choice: Choice): CaptureVariant[] {
  const selection = frame.selection;
  if (selection?.message.mode !== 'user') return [];
  const layout = wantedLayout(frame, selection, choice);
  const offered = frame.variants.filter((variant) => withMessage(variant) && (layout === null || layoutIdOf(variant) === layout));
  const messages = distinct(offered, (variant) => String(variant.index));
  return messages.length > 1 ? messages : [];
}

/** The step the user is on next: the design if it has to be chosen, then the message, then the photo. */
export function nextStep(frame: CaptureFrame | null, choice: Choice): SelectStep {
  if (!frame?.selection) return 'capture-photo';
  const layouts = layoutsToChoose(frame);
  if (layouts.length > 0 && !layouts.some((variant) => layoutIdOf(variant) === choice.layoutId)) return 'select-layout';
  const messages = messagesToChoose(frame, choice);
  if (messages.length > 0 && !messages.some((variant) => variant.index === choice.messageIndex)) return 'select-message';
  return 'capture-photo';
}

/** The choice after the user picked a design: the message stays if the new design offers it, else it is dropped and asked again. */
export function chooseLayout(frame: CaptureFrame, choice: Choice, layoutId: string): Choice {
  const stays = choice.messageIndex !== null && frame.variants.some((variant) => layoutIdOf(variant) === layoutId && variant.index === choice.messageIndex);
  return { layoutId, messageIndex: stays ? choice.messageIndex : null };
}

/**
 * The image for one photo: a new draw every time among the images that fit, never the same message on the same design as the photo before while another fits. With the design and the
 * message both fixed only one image fits.
 */
export function drawVariant(frame: CaptureFrame, choice: Choice, previousKey: string | null, random: () => number = Math.random): CaptureVariant | null {
  const candidates = fitting(frame, choice);
  if (candidates.length === 0) return null;
  const others = candidates.length > 1 ? candidates.filter((variant) => variantKeyOf(variant) !== previousKey) : candidates;
  const pool = others.length > 0 ? others : candidates;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/**
 * The frame of the event's own a photo gets when the event has several complete frames and the setting says the editor picks it or it is random; null when the user chooses (the
 * select frame step) or when the pick is not one of the frames. Never the same frame twice in a row while another exists.
 */
export function drawOwnFrame<T extends { frameId: string }>(
  frames: readonly T[],
  layout: CaptureSelection['layout'],
  previousId: string | null,
  random: () => number = Math.random
): T | null {
  if (layout.mode === 'editor') return frames.find((frame) => frame.frameId === layout.pick) ?? null;
  if (layout.mode !== 'random' || frames.length === 0) return null;
  const others = frames.length > 1 ? frames.filter((frame) => frame.frameId !== previousId) : frames;
  const pool = others.length > 0 ? others : frames;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
