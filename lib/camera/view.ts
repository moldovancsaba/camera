/**
 * The views of the live camera on a phone (issue 525; owner report 2026-10-09, four screenshots of the iPhone's own Camera app): **portrait or landscape**, and **wide or tight**.
 * The front camera of the newest iPhones has a square sensor and the Camera app offers all four; Safari gives a page no control over that camera mode (it is a native camera feature),
 * and the device's own camera that a file input opens shows only some of them. So the page offers the views itself, on its live view: a landscape view is a stream asked for in the
 * landscape shape whatever way the phone is held (a square-sensor phone delivers the shape that was asked for, lib/camera/constraints.ts), and a tight view is the middle part of the
 * stream, cut when the photo is taken (the phone's own zoom is not available to a page on every phone, a crop is). Pure and DOM-free, unit-tested in view.test.ts.
 */

/** `auto` follows the way the phone is held (what the live view always did); the others are the person's choice. */
export type ViewShape = 'auto' | 'portrait' | 'landscape';
export type ViewField = 'wide' | 'tight';

export interface CameraView {
  shape: ViewShape;
  field: ViewField;
}

export const DEFAULT_VIEW: CameraView = { shape: 'auto', field: 'wide' };

/** The tight view keeps the middle part of the picture: this fraction of its width and of its height (about 1.4 times closer). */
export const TIGHT_KEEP = 0.7;

/** `?views=1` turns the view controls on (and the live view with them): the way to try them on a phone before an event uses them. */
export function viewsOverride(search: string): boolean {
  try {
    const value = new URLSearchParams(search).get('views');
    return value === '1' || value === 'on' || value === 'true';
  } catch {
    return false;
  }
}

/**
 * The window the stream is asked for: the real window in `auto`, a portrait or a landscape one when the person chose a shape. The camera constraints and the check that the stream has
 * the shape wanted (`streamShapeMismatch`) both read it, so a landscape view stays landscape while the phone is held upright.
 */
export function wantedWindow(shape: ViewShape, windowWidth: number, windowHeight: number): { width: number; height: number } {
  if (shape === 'portrait') return { width: 9, height: 16 };
  if (shape === 'landscape') return { width: 16, height: 9 };
  return { width: windowWidth, height: windowHeight };
}

/** The part of the camera picture a view keeps, as fractions of it (x, y, width, height), or null for the whole picture. */
export function viewCrop(field: ViewField): { x: number; y: number; width: number; height: number } | null {
  if (field !== 'tight') return null;
  return { x: (1 - TIGHT_KEEP) / 2, y: (1 - TIGHT_KEEP) / 2, width: TIGHT_KEEP, height: TIGHT_KEEP };
}

/** The view after a press of one of the two choices; the other choice stays. Pressing the shape that is already chosen changes nothing. */
export function withShape(view: CameraView, shape: ViewShape): CameraView {
  return view.shape === shape ? view : { ...view, shape };
}

export function withField(view: CameraView, field: ViewField): CameraView {
  return view.field === field ? view : { ...view, field };
}

/** The shape a stream of this size is in, for showing which of the two shapes is on when the view is `auto`. */
export function currentShape(videoWidth: number, videoHeight: number): 'portrait' | 'landscape' {
  return videoHeight > videoWidth ? 'portrait' : 'landscape';
}
