/**
 * The generated default frame as the guest capture page uses it (camera#236): what is derived from
 * `events.frameDesign` and the editor's setting, which variant a shutter press gets, the territories shown before the real composition, and the
 * checked record of the variant a submission used. Which layout and message a user gets under the setting is `choose.ts`. Pure and client-safe (no server imports).
 */

import type { FrameVariant } from './context';
import type { LayerId } from './layout';
import { MAX_FRAME_MESSAGES, pickMessage } from './messages';
import { storedFrameSelection, type SelectMode } from './selection';

/** One generated image of the frame, as the capture page needs it. */
export interface CaptureVariant {
  /** Position in the event's message list; null for the single image without a message. */
  index: number | null;
  message: string | null;
  imageUrl: string;
  width: number;
  height: number;
  layers: FrameVariant['layers'];
  /** The library frame (design) this image is written on; null for the generated layout. A message on several designs has one image for each (issue 449). */
  frameId: string | null;
}

/** The editor's setting as the capture page uses it (lib/frame/selection.ts), with a picked message as its position in the message list; null where the event never set it. */
export interface CaptureSelection {
  layout: { mode: SelectMode; pick: string | null };
  message: { mode: SelectMode; pick: number | null };
}

export interface CaptureFrame {
  width: number;
  height: number;
  variants: CaptureVariant[];
  /** Set only when an editor saved how users get the layout and the message; without it the page keeps the random image at every shutter press. */
  selection: CaptureSelection | null;
}

/** A layer box as fractions (0..1) of the frame, for the 50% black territory shown before the real composition. */
export interface Territory {
  id: LayerId;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What a submission keeps of the variant it used; the image is kept (old images are never deleted) for try-on. */
export interface RecordedFrameVariant {
  index: number | null;
  message: string | null;
  imageUrl: string;
}

/** One assignment of a frame to an event, as the event data carries it; `frameDetails` is the library item behind it. */
interface FrameAssignmentRow {
  isActive?: boolean;
  frameDetails?: { hasMessageArea?: boolean } | null;
}

interface EventWithFrames {
  frames?: FrameAssignmentRow[] | null;
  frameDesign?: { variants?: FrameVariant[] | null; messages?: string[] | null } | null;
  /** How users get the layout and the message (`Event.frameSelection`). */
  frameSelection?: unknown;
}

/** The saved setting for the page: a picked message becomes its position in the message list, and a pick that is no longer in the list becomes none (the page then draws at random). */
function captureSelectionOf(stored: unknown, messages: readonly string[]): CaptureSelection | null {
  const selection = storedFrameSelection(stored);
  if (!selection) return null;
  const at = selection.message.pick === null ? -1 : messages.indexOf(selection.message.pick);
  return { layout: selection.layout, message: { mode: selection.message.mode, pick: at >= 0 ? at : null } };
}

/**
 * A frame of the event's own, one the guest picks: switched on for the event, and a complete frame. A text-free frame with a message area carries the
 * messages of the event (camera#366); it is an ingredient of the generated frame, not a frame of its own.
 */
export function isOwnActiveFrame(row: FrameAssignmentRow): boolean {
  return Boolean(row.isActive) && row.frameDetails?.hasMessageArea !== true;
}

/**
 * The generated frame of an event, or null: it applies only while the event has no active frame of its own, and only
 * once at least one image exists. Derived, never stored, so assigning or removing an own frame switches it at once.
 */
export function captureFrameOf(event: EventWithFrames): CaptureFrame | null {
  if (event.frames?.some(isOwnActiveFrame)) return null;
  const variants = (event.frameDesign?.variants ?? [])
    .filter((variant) => variant.imageUrl && variant.width > 0 && variant.height > 0)
    .map(({ index, message, imageUrl, width, height, layers, frameId }) => ({ index, message, imageUrl, width, height, layers, frameId: frameId ?? null }));
  if (variants.length === 0) return null;
  return { width: variants[0].width, height: variants[0].height, variants, selection: captureSelectionOf(event.frameSelection, event.frameDesign?.messages ?? []) };
}

/** A random variant for one shutter press, never the one used last time when another exists. */
export function pickVariant(
  frame: CaptureFrame,
  previousIndex: number | null,
  random: () => number = Math.random
): CaptureVariant | null {
  // A message on several designs has several images with one position, so "not the last one" is by position first and falls back to any image when that leaves none.
  const others = frame.variants.filter((variant) => variant.index !== previousIndex);
  return pickMessage(others.length > 0 && frame.variants.length > 1 ? others : frame.variants, null, random);
}

export function territoriesOf(variant: Pick<CaptureVariant, 'width' | 'height' | 'layers'>): Territory[] {
  return variant.layers
    .filter((layer) => layer.width > 0 && layer.height > 0)
    .map((layer) => ({
      id: layer.id,
      left: layer.x / variant.width,
      top: layer.y / variant.height,
      width: layer.width / variant.width,
      height: layer.height / variant.height,
    }));
}

/** A filled message can carry a long team name, so the cap is wider than the 80 characters of a template. */
const RECORDED_MESSAGE_MAX = 300;

/**
 * What the guest page claims about the variant it used, reduced to what may be stored: a message position and text of
 * bounded size, and an image URL that must be one of this project's generated frame images (https, own Blob store,
 * `frames/generated/`, a PNG). Anything else gives null, so a wrong claim never costs the photo.
 */
export function sanitizeFrameVariant(claim: unknown, storeHost: string | null): RecordedFrameVariant | null {
  if (!storeHost || !claim || typeof claim !== 'object') return null;
  const { index, message, imageUrl } = claim as Record<string, unknown>;

  if (typeof imageUrl !== 'string') return null;
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  const own =
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === storeHost &&
    !url.search &&
    !url.hash &&
    url.pathname.startsWith('/frames/generated/') &&
    url.pathname.endsWith('.png');
  if (!own) return null;

  const position = index === null ? null : Number.isInteger(index) && (index as number) >= 0 && (index as number) < MAX_FRAME_MESSAGES ? (index as number) : undefined;
  if (position === undefined) return null;
  const text = message === null ? null : typeof message === 'string' && message.length <= RECORDED_MESSAGE_MAX ? message : undefined;
  if (text === undefined) return null;

  return { index: position, message: text, imageUrl: url.toString() };
}
