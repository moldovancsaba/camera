/**
 * Fit = contain entire stage in viewport (letterbox).
 * Fill = cover viewport (crop overflow).
 */

export type ViewportScaleMode = 'fit' | 'fill';

const SLIDESHOW_STAGE_ASPECT = 16 / 9;

/**
 * 16:9 slideshow stage size inside a rectangular container (layout cell or window).
 */
export function slideshowStageDimensions(
  containerW: number,
  containerH: number,
  mode: ViewportScaleMode
): { width: number; height: number } {
  if (containerW <= 0 || containerH <= 0) {
    return { width: 0, height: 0 };
  }
  const ar = SLIDESHOW_STAGE_ASPECT;
  const car = containerW / containerH;
  if (mode === 'fit') {
    if (car > ar) {
      const height = containerH;
      const width = height * ar;
      return { width, height };
    }
    const width = containerW;
    const height = width / ar;
    return { width, height };
  }
  if (car > ar) {
    const width = containerW;
    const height = width / ar;
    return { width, height };
  }
  const height = containerH;
  const width = height * ar;
  return { width, height };
}

/**
 * Composite layout: grid has cols × rows uniform cells → overall aspect width/height = cols/rows.
 */
export function layoutGridStageDimensions(
  viewportW: number,
  viewportH: number,
  cols: number,
  rows: number,
  mode: ViewportScaleMode
): { width: number; height: number } {
  if (viewportW <= 0 || viewportH <= 0 || cols < 1 || rows < 1) {
    return { width: 0, height: 0 };
  }
  const ar = cols / rows;
  const car = viewportW / viewportH;
  if (mode === 'fit') {
    if (car > ar) {
      const height = viewportH;
      const width = height * ar;
      return { width, height };
    }
    const width = viewportW;
    const height = width / ar;
    return { width, height };
  }
  if (car > ar) {
    const width = viewportW;
    const height = width / ar;
    return { width, height };
  }
  const height = viewportH;
  const width = height * ar;
  return { width, height };
}
