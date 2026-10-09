/**
 * Records the whole camera image (camera#208). DOM only, so it is not unit-tested; the decisions
 * (limits, crop math) live in constraints.ts and reframe.ts. Verified in a browser with a fake
 * camera whose test card has marked corners.
 */

import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import {
  ORIGINAL_JPEG_QUALITY,
  ORIGINAL_MAX_LONG_SIDE,
  ORIGINAL_MAX_PIXELS,
  capCanvasSize,
  type FacingModeValue,
} from './constraints';

/** The pure camera image: no crop, no frame, not mirrored. */
export interface FullFrameCapture {
  blob: Blob;
  dataUrl: string;
  /** Pixel size of the stored image: the video frame, capped for canvas safety. */
  width: number;
  height: number;
  facingMode: FacingModeValue;
  /** True when the live preview was mirrored (front camera). The image itself is NOT mirrored. */
  mirrored: boolean;
  /** How the image was taken (camera#257): a real still, the device's own camera, or a video frame. Absent for older code paths. */
  method?: 'still' | 'system' | 'frame';
  /** The photo's own size before the cap (still and system only). */
  nativeWidth?: number;
  nativeHeight?: number;
}

/** Base64 data URL of an existing blob, without re-encoding the image. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the image'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Draws the current video frame 1:1 (only scaled down when it exceeds the original limits) and
 * encodes it as a high-quality JPEG. Returns null when the frame cannot be drawn or encoded, so
 * the caller can retry.
 */
export async function captureFullFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  facingMode: FacingModeValue,
  /** The part of the picture to keep, as fractions (the tight view, lib/camera/view.ts); the whole picture when missing. */
  crop?: { x: number; y: number; width: number; height: number } | null
): Promise<FullFrameCapture | null> {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const sx = crop ? Math.round(crop.x * video.videoWidth) : 0;
  const sy = crop ? Math.round(crop.y * video.videoHeight) : 0;
  const sw = crop ? Math.max(1, Math.round(crop.width * video.videoWidth)) : video.videoWidth;
  const sh = crop ? Math.max(1, Math.round(crop.height * video.videoHeight)) : video.videoHeight;

  const { width, height } = capCanvasSize(sw, sh, {
    maxLongSide: ORIGINAL_MAX_LONG_SIDE,
    maxPixels: ORIGINAL_MAX_PIXELS,
  });
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
  if (!ctx) {
    return null;
  }

  // Safari fix: fill with a white background first
  ctx.fillStyle = CAMERA_STAGE_WHITE;
  ctx.fillRect(0, 0, width, height);

  try {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  } catch (error) {
    console.error('Error drawing video to canvas:', error);
    return null;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', ORIGINAL_JPEG_QUALITY));
  if (!blob) {
    return null;
  }

  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    width,
    height,
    facingMode,
    mirrored: facingMode === 'user',
  };
}
