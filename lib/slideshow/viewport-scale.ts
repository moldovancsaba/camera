/**
 * Fit = contain entire stage in viewport (letterbox).
 * Fill = cover viewport (crop overflow).
 */

export type ViewportScaleMode = 'fit' | 'fill';

const SLIDESHOW_STAGE_ASPECT_DEFAULT = 16 / 9;

/**
 * Slideshow stage size inside a rectangular container (layout cell or window).
 * @param stageAspectWidthOverHeight width ÷ height of the stage (e.g. 16/9 landscape, 9/16 portrait for FunFitFan).
 */
export function slideshowStageDimensions(
  containerW: number,
  containerH: number,
  mode: ViewportScaleMode,
  stageAspectWidthOverHeight: number = SLIDESHOW_STAGE_ASPECT_DEFAULT
): { width: number; height: number } {
  if (containerW <= 0 || containerH <= 0) {
    return { width: 0, height: 0 };
  }
  const ar =
    Number.isFinite(stageAspectWidthOverHeight) && stageAspectWidthOverHeight > 0
      ? stageAspectWidthOverHeight
      : SLIDESHOW_STAGE_ASPECT_DEFAULT;
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

/** Cell shape for composite layout geometry (each grid unit is uw:uh). */
export type SlideshowLayoutCellAspect = '16:9' | '9:16';

export function normalizeSlideshowLayoutCellAspect(
  raw: unknown
): SlideshowLayoutCellAspect {
  return raw === '9:16' ? '9:16' : '16:9';
}

/** Integer width:height of one layout cell (e.g. 16:9 → 16, 9). */
export function layoutGridCellUnits(
  cellAspect: SlideshowLayoutCellAspect
): { uw: number; uh: number } {
  return cellAspect === '9:16' ? { uw: 9, uh: 16 } : { uw: 16, uh: 9 };
}

/**
 * Composite layout: cols × rows uniform cells, each cell uw:uh (default 16:9 stage).
 *
 * Outer width:height = (cols × uw) : (rows × uh) (e.g. 3×1 with 9:16 cells → 27:16).
 */
export function layoutGridAspectRatioCss(
  cols: number,
  rows: number,
  cellAspect: SlideshowLayoutCellAspect = '16:9'
): string {
  const { uw, uh } = layoutGridCellUnits(cellAspect);
  if (cols < 1 || rows < 1) return `${uw} / ${uh}`;
  return `${cols * uw} / ${rows * uh}`;
}

/**
 * Pixel size of the cols×rows videowall block inside a viewport rectangle.
 * `fit` = contain entire grid (public `/slideshow-layout/...` always uses this).
 * `fill` = cover viewport (may crop the grid); unused by the public composite player.
 */
export function layoutGridStageDimensions(
  viewportW: number,
  viewportH: number,
  cols: number,
  rows: number,
  mode: ViewportScaleMode,
  cellAspect: SlideshowLayoutCellAspect = '16:9'
): { width: number; height: number } {
  if (viewportW <= 0 || viewportH <= 0 || cols < 1 || rows < 1) {
    return { width: 0, height: 0 };
  }
  const { uw, uh } = layoutGridCellUnits(cellAspect);
  const ar = (cols * uw) / (rows * uh);
  const car = viewportW / viewportH;
  if (mode === 'fit') {
    let width: number;
    let height: number;
    if (car > ar) {
      height = viewportH;
      width = height * ar;
    } else {
      width = viewportW;
      height = width / ar;
    }
    /* Uniform scale fixes float noise and keeps aspect when capping to viewport */
    const scale = Math.min(1, viewportW / width, viewportH / height);
    width *= scale;
    height *= scale;
    return {
      width: Math.max(0, Math.floor(width)),
      height: Math.max(0, Math.floor(height)),
    };
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
