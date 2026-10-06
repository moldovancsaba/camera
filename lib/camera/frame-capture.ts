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
  facingMode: FacingModeValue
): Promise<FullFrameCapture | null> {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const { width, height } = capCanvasSize(video.videoWidth, video.videoHeight, {
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
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, width, height);
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
