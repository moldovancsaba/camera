/**
 * The largest still the device can give, taken at the moment of the shutter (camera#257).
 *
 * It has to work the same way for every camera (owner, 2026-10-06): the largest still the camera can take, at the moment of
 * the shutter, then the same zoom and pan, then only the frame-sized result is kept. Chosen by `chooseCaptureMethod`:
 *  - `system`: EVERY touch device (iPhone, iPad, Android phones and tablets): the device's own camera app, through a file
 *    input with `capture`, gives the camera's full still (an iPhone Air front camera: 18 MP, 4896 x 3672), the same on all
 *    of them whatever the browser or sensor. There is no live view inside the page then; the frame's boxes show in the
 *    reframe step.
 *  - `still`: where there is no camera app to open (a desktop webcam) and the browser can take a still
 *    (`ImageCapture.takePhoto`: Chrome, Edge): the live view stays and the shutter takes the sensor's own photo.
 *  - `frame`: a desktop webcam in a browser that cannot (Safari, Firefox): the current video frame, the most it can give.
 * Whatever the method, the result is a `FullFrameCapture`: the whole photo, not cropped, upright, at the size the camera
 * gave (no re-encoding, so nothing is lost); the reframe step lets the guest zoom and pan anywhere in it, and only the
 * frame-sized result is saved: the full photo stays in the browser and is dropped (owner decision 2026-10-06).
 *
 * The pure choices are unit-tested (still-capture.test.ts); the DOM parts are checked in a browser.
 */

import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { ORIGINAL_JPEG_QUALITY, ORIGINAL_MAX_LONG_SIDE, ORIGINAL_MAX_PIXELS, capCanvasSize, type FacingModeValue } from './constraints';

/**
 * The most pixels a photo is kept at as it is. An iPhone Air front camera gives 18 MP, phones with 50 to 200 MP sensors give
 * 12 to 50 MP stills; only a photo above this is scaled down (a canvas that large would not be safe), and a still is never
 * asked for more than this.
 */
export const PHOTO_MAX_PIXELS = 40_000_000;
import type { FullFrameCapture } from './frame-capture';

export type CaptureMethod = 'still' | 'system' | 'frame';

/** `?capture=frame|still|system` forces a method, for testing and as the way back to the old capture. */
export function captureOverride(search: string): CaptureMethod | null {
  try {
    const value = new URLSearchParams(search).get('capture');
    return value === 'frame' || value === 'still' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The device's own camera on every touch device; on a desktop webcam a real still where the browser can take one, else the
 * video frame. A forced `still` without `ImageCapture` falls back to the frame (it cannot work); a forced `system` or
 * `frame` is honoured anywhere (the way back to the old capture is `?capture=frame`). `?views=1` (the view controls) uses the live view, as `frame`.
 */
export function chooseCaptureMethod(env: { touchPrimary: boolean; stillCapture: boolean; override?: CaptureMethod | null; views?: boolean }): CaptureMethod {
  if (env.override === 'frame' || env.override === 'system') return env.override;
  if (env.override === 'still') return env.stillCapture ? 'still' : 'frame';
  // The view controls (portrait or landscape, wide or tight; lib/camera/view.ts) are on the page's own live view, which the device's camera app does not have (issue 525).
  if (env.views) return 'frame';
  if (env.touchPrimary) return 'system';
  return env.stillCapture ? 'still' : 'frame';
}

/** Browser support for `ImageCapture.takePhoto`. */
export function hasStillCapture(): boolean {
  try {
    const ctor = (globalThis as Record<string, unknown>)['ImageCapture'];
    if (typeof ctor !== 'function') return false;
    const proto = (ctor as { prototype?: Record<string, unknown> }).prototype;
    return typeof proto?.['takePhoto'] === 'function';
  } catch {
    return false;
  }
}

export interface PhotoCapabilitiesLike {
  imageWidth?: { max?: number } | null;
  imageHeight?: { max?: number } | null;
}

/**
 * The largest photo the camera offers (at most PHOTO_MAX_PIXELS, scaled down in its own shape beyond that), or undefined
 * when it does not say (then the camera's default photo is taken).
 */
export function largestPhotoSettings(caps: PhotoCapabilitiesLike | null | undefined): { imageWidth: number; imageHeight: number } | undefined {
  const width = caps?.imageWidth?.max;
  const height = caps?.imageHeight?.max;
  if (typeof width !== 'number' || typeof height !== 'number' || !(width > 0) || !(height > 0)) return undefined;
  const scale = Math.min(1, Math.sqrt(PHOTO_MAX_PIXELS / (width * height)));
  return { imageWidth: Math.floor(width * scale), imageHeight: Math.floor(height * scale) };
}

/** True when two width/height ratios are within `tolerance` (relative) of each other. */
export function aspectsAgree(a: number, b: number, tolerance = 0.03): boolean {
  return a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

interface ImageCaptureLike {
  getPhotoCapabilities(): Promise<PhotoCapabilitiesLike>;
  takePhoto(settings?: { imageWidth: number; imageHeight: number }): Promise<Blob>;
}

/** A real photo from the live camera, at the largest size it offers. Rejects after `timeoutMs`, so the caller can fall back. */
export async function takeStillBlob(track: MediaStreamTrack, timeoutMs = 7000): Promise<Blob> {
  const Ctor = (globalThis as unknown as { ImageCapture: new (track: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  const capture = new Ctor(track);
  const settings = largestPhotoSettings(await capture.getPhotoCapabilities().catch(() => null));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      capture.takePhoto(settings),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The photo took too long')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The photo's size with its EXIF orientation applied, read by decoding it once (the decoded copy is dropped at once). */
async function readPhotoSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size.width > 0 && size.height > 0 ? size : null;
    } catch {
      // An engine that does not know `from-image`: an image element applies the orientation everywhere.
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const done = (size: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => done(null);
    image.src = url;
  });
}

/**
 * A photo file or blob as the pure camera image, at the size the camera gave. It is NOT re-encoded (a re-encode would only
 * lose detail the guest may want to zoom into); only a photo above PHOTO_MAX_PIXELS is drawn smaller and encoded again.
 * Returns null when the photo cannot be opened (for example a format the browser cannot decode).
 */
export async function fullFrameFromBlob(
  blob: Blob,
  canvas: HTMLCanvasElement,
  options: { facingMode: FacingModeValue; mirrored: boolean; method: CaptureMethod }
): Promise<FullFrameCapture | null> {
  const native = await readPhotoSize(blob);
  if (!native) return null;
  const base = { facingMode: options.facingMode, mirrored: options.mirrored, method: options.method, nativeWidth: native.width, nativeHeight: native.height };

  if (native.width * native.height <= PHOTO_MAX_PIXELS) {
    // The preview URL is only a handle on the same blob; the page decodes the blob itself.
    return { ...base, blob, dataUrl: URL.createObjectURL(blob), width: native.width, height: native.height };
  }

  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) return null;
  try {
    const { width, height } = capCanvasSize(native.width, native.height, { maxLongSide: ORIGINAL_MAX_LONG_SIDE * 2, maxPixels: ORIGINAL_MAX_PIXELS * 2 });
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
    if (!ctx) return null;
    ctx.fillStyle = CAMERA_STAGE_WHITE;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, native.width, native.height, 0, 0, width, height);
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', ORIGINAL_JPEG_QUALITY));
    return encoded ? { ...base, blob: encoded, dataUrl: URL.createObjectURL(encoded), width, height } : null;
  } finally {
    bitmap.close();
  }
}
