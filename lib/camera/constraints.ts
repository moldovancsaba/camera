/**
 * Camera constraints and canvas limits for components/camera/CameraCapture.tsx (camera#207).
 * Pure and DOM-free (the one DOM probe is `detectTouchPrimaryDevice`), unit-tested in
 * constraints.test.ts.
 *
 * Why these choices, and what is still a hypothesis:
 * - No `aspectRatio` constraint. The browser may crop the camera frame to satisfy it
 *   ("crop-and-scale"), which loses field of view before the page ever sees the image.
 *   Whether a given phone does so is shown by the capture diagnostics (requested versus
 *   granted mode); the full-frame capture (camera#208) removes the need to care.
 * - A 4:3 mode (1440x1920 portrait, 1920x1440 landscape) instead of 4K or 16:9. Most phone
 *   sensors are 4:3, 16:9 video modes are crops of them, and a 4:3 stream cropped to any frame
 *   shows at least as much of the scene as a 16:9 stream cropped to the same frame. 2.8 MP also
 *   starts much faster than the 4K request it replaces. Treat the numbers as starting values
 *   to tune with the owner's phone tests.
 * - The shape follows the window when the camera starts and again after a turn (`streamShapeMismatch`): a phone with a
 *   square sensor delivers the shape that was asked for, not the one it is held in (camera#254).
 * - `facingMode` is always an `ideal`, never an `exact`: devices without a facing mode (most
 *   webcams) simply ignore it, so no user-agent sniffing is needed to decide whether to send it.
 */

export type FacingModeValue = 'user' | 'environment';

export interface ConstraintStep {
  /** For the diagnostics: the first step is 'preferred', later steps are 'relaxed'. */
  label: 'preferred' | 'relaxed';
  constraints: MediaTrackConstraints | boolean;
  /** The ideal size asked for in the preferred step (diagnostics only). */
  width?: number;
  height?: number;
}

/** 4:3 mode: the long and short side. */
export const NATIVE_LONG_SIDE = 1920;
export const NATIVE_SHORT_SIDE = 1440;

/**
 * Ordered attempts for getUserMedia: the preferred 4:3 mode, then the camera facing only, then
 * anything. Orientation only matters on touch-primary devices (a phone held upright delivers a
 * portrait stream); webcams always deliver landscape.
 */
export function buildVideoConstraintChain(options: {
  facing: FacingModeValue;
  portrait: boolean;
  touchPrimary: boolean;
}): ConstraintStep[] {
  const portraitShape = options.touchPrimary && options.portrait;
  const width = portraitShape ? NATIVE_SHORT_SIDE : NATIVE_LONG_SIDE;
  const height = portraitShape ? NATIVE_LONG_SIDE : NATIVE_SHORT_SIDE;

  return [
    {
      label: 'preferred',
      width,
      height,
      constraints: {
        facingMode: { ideal: options.facing },
        width: { ideal: width },
        height: { ideal: height },
      },
    },
    { label: 'relaxed', constraints: { facingMode: { ideal: options.facing } } },
    { label: 'relaxed', constraints: true },
  ];
}

export type StreamShape = 'portrait' | 'landscape' | 'square';

/** The shape of a width and height; within 3% of square counts as square. */
export function shapeOf(width: number, height: number): StreamShape {
  if (!(width > 0) || !(height > 0)) return 'square';
  const ratio = width / height;
  return Math.abs(ratio - 1) <= 0.03 ? 'square' : ratio > 1 ? 'landscape' : 'portrait';
}

/**
 * The window's shape when a touch device's stream is the wrong way round for it (a portrait picture in a landscape
 * window or the other way round), else null. Phones whose picture follows how they are held never mismatch; a phone with
 * a square sensor (the iPhone's Center Stage front camera) delivers the shape that was asked for when the camera started,
 * not the one it is held in, so after the phone is turned the camera has to be asked again, now for the window's shape
 * (`buildVideoConstraintChain` reads the window). A square window or picture, or a desktop, never mismatches.
 */
export function streamShapeMismatch(env: {
  touchPrimary: boolean;
  windowWidth: number;
  windowHeight: number;
  videoWidth: number;
  videoHeight: number;
}): StreamShape | null {
  if (!env.touchPrimary) return null;
  const video = shapeOf(env.videoWidth, env.videoHeight);
  const window = shapeOf(env.windowWidth, env.windowHeight);
  return video !== 'square' && window !== 'square' && video !== window ? window : null;
}

/** Errors for which trying looser constraints is pointless (the user said no, or no camera). */
export function isTerminalCameraError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError'
  );
}

/** True for phones and tablets: a coarse primary pointer, or the UA client hint `mobile`. */
export function isTouchPrimaryDevice(env: { coarsePointer: boolean; uaMobile?: boolean }): boolean {
  return env.coarsePointer || env.uaMobile === true;
}

/** Reads the browser; deliberately not based on the user-agent string (iPadOS reports a Mac). */
export function detectTouchPrimaryDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
    return isTouchPrimaryDevice({ coarsePointer, uaMobile });
  } catch {
    return false;
  }
}

/** Long side and total pixel caps for the capture canvas (iOS Safari blanks canvases above 16.7 MP). */
export const CANVAS_MAX_LONG_SIDE = 2048;
export const CANVAS_MAX_PIXELS = 8_000_000;

/**
 * Limits for the full-frame original (camera#208): higher than the cropped output because it is
 * the pure image that is kept, but still well under iOS Safari's 16,777,216 pixel canvas limit.
 */
export const ORIGINAL_MAX_LONG_SIDE = 4096;
export const ORIGINAL_MAX_PIXELS = 12_000_000;

/** JPEG quality of the full-frame original. */
export const ORIGINAL_JPEG_QUALITY = 0.92;

/** Scales a size down, keeping its aspect ratio, until it is within both caps. Never scales up. */
export function capCanvasSize(
  width: number,
  height: number,
  limits: { maxLongSide?: number; maxPixels?: number } = {}
): { width: number; height: number } {
  const maxLongSide = limits.maxLongSide ?? CANVAS_MAX_LONG_SIDE;
  const maxPixels = limits.maxPixels ?? CANVAS_MAX_PIXELS;
  if (!(width > 0) || !(height > 0)) {
    return { width: Math.max(1, Math.round(width) || 1), height: Math.max(1, Math.round(height) || 1) };
  }

  const scale = Math.min(1, maxLongSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
