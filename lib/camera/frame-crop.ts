/**
 * Crops the full camera image to a frame's aspect ratio (camera#208). The default placement is
 * the largest centred crop (reframe.ts); the front camera result is mirrored, as it always was,
 * so the photo matches what the person saw. DOM only; the math is unit-tested in reframe.test.ts.
 */

import { capCanvasSize } from './constraints';
import { blobToDataUrl, type FullFrameCapture } from './frame-capture';
import { fillCropRect } from './reframe';

/** Same quality the capture used before the crop became a separate step. */
const CROP_JPEG_QUALITY = 0.95;

export interface CroppedCapture {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load the captured image'));
    image.src = url;
  });
}

export async function cropCaptureToAspect(capture: FullFrameCapture, targetAspect: number): Promise<CroppedCapture> {
  const objectUrl = URL.createObjectURL(capture.blob);
  try {
    const image = await loadImage(objectUrl);
    const rect = fillCropRect(image.naturalWidth, image.naturalHeight, targetAspect);
    const { width, height } = capCanvasSize(rect.width, rect.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    if (capture.mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CROP_JPEG_QUALITY));
    if (!blob) {
      throw new Error('Failed to encode the cropped image');
    }
    return { blob, dataUrl: await blobToDataUrl(blob), width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
