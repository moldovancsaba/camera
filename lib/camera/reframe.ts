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
