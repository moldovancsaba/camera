/**
 * Crop math between the full camera image and a frame (camera#208; the adjustable reframe step
 * is camera#209). Pure and DOM-free, unit-tested in reframe.test.ts.
 *
 * The camera image is recorded whole and unmirrored; the frame's aspect ratio is applied to it
 * afterwards. The default placement is the largest rectangle of the frame's aspect that fits
 * inside the image, centred: the same crop the old capture produced, now done as a separate step.
 */

export interface CropRect {
  /** Source pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FractionRect {
  /** 0 to 1 of the source width and height. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Largest centred rectangle of `targetAspect` (width over height) that fits inside the source. */
export function fillCropRect(sourceWidth: number, sourceHeight: number, targetAspect: number): CropRect {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  if (!(targetAspect > 0) || !Number.isFinite(targetAspect)) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  let width = sourceWidth;
  let height = sourceHeight;

  if (targetAspect > sourceAspect) {
    // The frame is wider than the image: keep the full width, trim top and bottom.
    height = sourceWidth / targetAspect;
  } else if (targetAspect < sourceAspect) {
    // The frame is taller than the image: keep the full height, trim left and right.
    width = sourceHeight * targetAspect;
  }

  width = Math.min(sourceWidth, Math.max(1, Math.round(width)));
  height = Math.min(sourceHeight, Math.max(1, Math.round(height)));
  return {
    x: Math.floor((sourceWidth - width) / 2),
    y: Math.floor((sourceHeight - height) / 2),
    width,
    height,
  };
}

/** The same rectangle as fractions of the source, for positioning a guide over a preview. */
export function toFractionRect(rect: CropRect, sourceWidth: number, sourceHeight: number): FractionRect {
  return {
    left: rect.x / sourceWidth,
    top: rect.y / sourceHeight,
    width: rect.width / sourceWidth,
    height: rect.height / sourceHeight,
  };
}

// ---------------------------------------------------------------------------------------------
// Adjustable reframe (camera#209). The fan can move and zoom the image inside the frame, or show
// the whole image. The view is a box of the frame's aspect ratio laid over the source image, in
// source pixels. At zoom 1 it is the "fill" box above; zooming out grows it until it contains the
// whole image ("fit"), where the parts outside the image are filled with a blurred backdrop.
// ---------------------------------------------------------------------------------------------

/** A box of the frame's aspect ratio over the source image, in source pixels; may extend past the image. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Zoom is relative to "fill" (1 = largest filling crop, below 1 = zoomed out, above 1 = zoomed in). */
export interface ReframeView {
  zoom: number;
  /** Centre of the view box in source pixels. */
  centerX: number;
  centerY: number;
}

export type ReframeMode = 'fill' | 'fit' | 'custom';

/** The largest zoom-in, relative to fill. */
export const MAX_ZOOM = 4;

const EPSILON = 1e-6;

/** Unrounded size of the largest box of `aspect` that fits inside the source (the fill box). */
export function fillSize(sourceWidth: number, sourceHeight: number, aspect: number): { width: number; height: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  return aspect > sourceAspect
    ? { width: sourceWidth, height: sourceWidth / aspect }
    : { width: sourceHeight * aspect, height: sourceHeight };
}

/** Size of the smallest box of `aspect` that contains the whole source (the fit box). */
export function fitSize(sourceWidth: number, sourceHeight: number, aspect: number): { width: number; height: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  return aspect > sourceAspect
    ? { width: sourceHeight * aspect, height: sourceHeight }
    : { width: sourceWidth, height: sourceWidth / aspect };
}

/** The zoom at which the whole image is visible; 1 when the frame and the image have the same shape. */
export function minZoom(sourceWidth: number, sourceHeight: number, aspect: number): number {
  const fill = fillSize(sourceWidth, sourceHeight, aspect);
  const fit = fitSize(sourceWidth, sourceHeight, aspect);
  return Math.min(1, fill.width / fit.width);
}

/**
 * Whether "show everything" differs from "fill": false when the frame has the image's own shape,
 * within half a percent, where the two views are indistinguishable.
 */
export function canShowEverything(sourceWidth: number, sourceHeight: number, aspect: number): boolean {
  return minZoom(sourceWidth, sourceHeight, aspect) < 0.995;
}

function clampAxis(center: number, boxSize: number, sourceSize: number): number {
  // A box larger than the image stays centred on it; a smaller one stays inside it. The tolerance
  // absorbs floating-point error where the fit box is exactly as large as the image on this axis.
  if (boxSize >= sourceSize - 1e-6) return sourceSize / 2;
  return Math.min(sourceSize - boxSize / 2, Math.max(boxSize / 2, center));
}

/** Keeps the zoom in range and the view box over the image. */
export function clampView(view: ReframeView, sourceWidth: number, sourceHeight: number, aspect: number): ReframeView {
  const low = minZoom(sourceWidth, sourceHeight, aspect);
  const zoom = Math.min(MAX_ZOOM, Math.max(low, Number.isFinite(view.zoom) ? view.zoom : 1));
  const fill = fillSize(sourceWidth, sourceHeight, aspect);
  return {
    zoom,
    centerX: clampAxis(view.centerX, fill.width / zoom, sourceWidth),
    centerY: clampAxis(view.centerY, fill.height / zoom, sourceHeight),
  };
}

/** The default placement: the largest filling crop, centred. */
export function defaultView(sourceWidth: number, sourceHeight: number): ReframeView {
  return { zoom: 1, centerX: sourceWidth / 2, centerY: sourceHeight / 2 };
}

/** The whole image visible, centred. */
export function fitView(sourceWidth: number, sourceHeight: number, aspect: number): ReframeView {
  return clampView(
    { zoom: minZoom(sourceWidth, sourceHeight, aspect), centerX: sourceWidth / 2, centerY: sourceHeight / 2 },
    sourceWidth,
    sourceHeight,
    aspect
  );
}

export function viewBoxOf(view: ReframeView, sourceWidth: number, sourceHeight: number, aspect: number): ViewBox {
  const clamped = clampView(view, sourceWidth, sourceHeight, aspect);
  const fill = fillSize(sourceWidth, sourceHeight, aspect);
  const width = fill.width / clamped.zoom;
  const height = fill.height / clamped.zoom;
  return { x: clamped.centerX - width / 2, y: clamped.centerY - height / 2, width, height };
}

/** Moves the view box by `dx`, `dy` source pixels (positive moves the box right and down). */
export function panView(
  view: ReframeView,
  dx: number,
  dy: number,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number
): ReframeView {
  return clampView({ ...view, centerX: view.centerX + dx, centerY: view.centerY + dy }, sourceWidth, sourceHeight, aspect);
}

/** Sets the zoom while keeping the source point `anchor` at the same place inside the view box. */
export function zoomView(
  view: ReframeView,
  newZoom: number,
  anchor: { x: number; y: number } | null,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number
): ReframeView {
  const before = viewBoxOf(view, sourceWidth, sourceHeight, aspect);
  const target = clampView({ ...view, zoom: newZoom }, sourceWidth, sourceHeight, aspect);
  if (!anchor) return target;

  const fill = fillSize(sourceWidth, sourceHeight, aspect);
  const width = fill.width / target.zoom;
  const height = fill.height / target.zoom;
  const u = (anchor.x - before.x) / before.width;
  const v = (anchor.y - before.y) / before.height;
  return clampView(
    { zoom: target.zoom, centerX: anchor.x - u * width + width / 2, centerY: anchor.y - v * height + height / 2 },
    sourceWidth,
    sourceHeight,
    aspect
  );
}

/** 'fill' at the default placement, 'fit' at the minimum zoom, otherwise 'custom'. */
export function modeOf(view: ReframeView, sourceWidth: number, sourceHeight: number, aspect: number): ReframeMode {
  const clamped = clampView(view, sourceWidth, sourceHeight, aspect);
  const low = minZoom(sourceWidth, sourceHeight, aspect);
  const centred =
    Math.abs(clamped.centerX - sourceWidth / 2) < 0.5 && Math.abs(clamped.centerY - sourceHeight / 2) < 0.5;

  if (Math.abs(clamped.zoom - 1) < EPSILON && centred) return 'fill';
  if (low < 1 - EPSILON && Math.abs(clamped.zoom - low) < EPSILON && centred) return 'fit';
  return 'custom';
}

/** What is stored with a photo so any crop can be redone (camera#210 persists it). */
export interface ReframeRecord {
  version: 1;
  mode: ReframeMode;
  zoom: number;
  /** The view box in source pixels; extends past the image in 'fit'. */
  crop: ViewBox;
  sourceWidth: number;
  sourceHeight: number;
  frameAspect: number;
  /** The result is mirrored (front camera); the original is not. */
  mirrored: boolean;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toReframeRecord(
  view: ReframeView,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
  mirrored: boolean
): ReframeRecord {
  const box = viewBoxOf(view, sourceWidth, sourceHeight, aspect);
  return {
    version: 1,
    mode: modeOf(view, sourceWidth, sourceHeight, aspect),
    zoom: round(clampView(view, sourceWidth, sourceHeight, aspect).zoom, 4),
    crop: { x: round(box.x, 1), y: round(box.y, 1), width: round(box.width, 1), height: round(box.height, 1) },
    sourceWidth,
    sourceHeight,
    frameAspect: round(aspect, 4),
    mirrored,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, min: number, max: number, decimals: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  return round(value, decimals);
}

/**
 * Validates a reframe record received from a browser before it is stored (camera#210). Returns a
 * record containing only the known fields, or null when anything is missing or out of range;
 * nothing is clamped silently, because a record that does not describe a real crop is not kept.
 */
export function sanitizeReframeRecord(input: unknown): ReframeRecord | null {
  if (!isPlainObject(input) || input.version !== 1) return null;
  if (input.mode !== 'fill' && input.mode !== 'fit' && input.mode !== 'custom') return null;
  if (typeof input.mirrored !== 'boolean' || !isPlainObject(input.crop)) return null;

  const zoom = boundedNumber(input.zoom, 0.05, 8, 4);
  const frameAspect = boundedNumber(input.frameAspect, 0.05, 20, 4);
  const sourceWidth = boundedNumber(input.sourceWidth, 1, 16384, 0);
  const sourceHeight = boundedNumber(input.sourceHeight, 1, 16384, 0);
  const x = boundedNumber(input.crop.x, -65536, 65536, 1);
  const y = boundedNumber(input.crop.y, -65536, 65536, 1);
  const width = boundedNumber(input.crop.width, 0.1, 65536, 1);
  const height = boundedNumber(input.crop.height, 0.1, 65536, 1);

  if (
    zoom === null || frameAspect === null || sourceWidth === null || sourceHeight === null ||
    x === null || y === null || width === null || height === null
  ) {
    return null;
  }

  return {
    version: 1,
    mode: input.mode,
    zoom,
    crop: { x, y, width, height },
    sourceWidth,
    sourceHeight,
    frameAspect,
    mirrored: input.mirrored,
  };
}
