/**
 * The generated default frame as the guest capture page uses it (camera#236): what is derived from
 * `events.frameDesign`, which variant a shutter press gets, the territories shown before the real composition, and the
 * checked record of the variant a submission used. Pure and client-safe (no server imports).
 */

import type { FrameVariant } from './context';
import type { LayerId } from './layout';
import { MAX_FRAME_MESSAGES, pickMessage } from './messages';

/** One generated image of the frame, as the capture page needs it. */
export interface CaptureVariant {
  /** Position in the event's message list; null for the single image without a message. */
  index: number | null;
  message: string | null;
  imageUrl: string;
  width: number;
  height: number;
  layers: FrameVariant['layers'];
}

export interface CaptureFrame {
  width: number;
  height: number;
  variants: CaptureVariant[];
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

interface EventWithFrames {
  frames?: Array<{ isActive?: boolean }> | null;
  frameDesign?: { variants?: FrameVariant[] | null } | null;
}

/**
 * The generated frame of an event, or null: it applies only while the event has no active frame of its own, and only
 * once at least one image exists. Derived, never stored, so assigning or removing an own frame switches it at once.
 */
export function captureFrameOf(event: EventWithFrames): CaptureFrame | null {
  if (event.frames?.some((frame) => frame.isActive)) return null;
  const variants = (event.frameDesign?.variants ?? [])
    .filter((variant) => variant.imageUrl && variant.width > 0 && variant.height > 0)
    .map(({ index, message, imageUrl, width, height, layers }) => ({ index, message, imageUrl, width, height, layers }));
  if (variants.length === 0) return null;
  return { width: variants[0].width, height: variants[0].height, variants };
}

/** A random variant for one shutter press, never the one used last time when another exists. */
export function pickVariant(
  frame: CaptureFrame,
  previousIndex: number | null,
  random: () => number = Math.random
): CaptureVariant | null {
  return pickMessage(frame.variants, previousIndex, random);
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
