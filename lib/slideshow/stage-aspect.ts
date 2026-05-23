import type { Event } from '@/lib/db/schemas';

/** Min width÷height (very tall stage). */
const STAGE_ASPECT_MIN = 0.25;
/** Max width÷height (very wide stage). */
const STAGE_ASPECT_MAX = 4;

export function defaultStageAspectWidthOverHeight(event: Event): number {
  void event;
  return 16 / 9;
}

export type SlideshowStageSource = { stageAspect?: number | null };

/**
 * Effective stage width÷height for playlist metadata and the player.
 * Uses `slideshow.stageAspect` when set to a finite number in range; otherwise event defaults.
 */
export function resolveSlideshowStageAspect(
  slideshow: SlideshowStageSource,
  event: Event
): number {
  const raw = slideshow.stageAspect;
  if (
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= STAGE_ASPECT_MIN &&
    raw <= STAGE_ASPECT_MAX
  ) {
    return raw;
  }
  return defaultStageAspectWidthOverHeight(event);
}

/**
 * PATCH/POST: normalize client body. `undefined` = omit field (no change on PATCH).
 * `null` = clear override (use event default). Otherwise clamp finite number.
 */
export function normalizeStageAspectInput(
  value: unknown
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(STAGE_ASPECT_MAX, Math.max(STAGE_ASPECT_MIN, n));
}
