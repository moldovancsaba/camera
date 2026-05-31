import type { Slideshow } from '@/lib/db/schemas';

export type EventTryOnResultSlideshowMode =
  | 'disabled'
  | 'mixed_with_originals'
  | 'approved_results_only';

export type SubmissionSourceMode =
  | 'originals_only'
  | 'approved_tryon_only'
  | 'originals_and_approved_tryon';

function isMode(value: unknown): value is EventTryOnResultSlideshowMode {
  return (
    value === 'disabled' ||
    value === 'mixed_with_originals' ||
    value === 'approved_results_only'
  );
}

export function normalizeEventTryOnResultSlideshowMode(
  event: { tryOn?: {
    enabled?: boolean;
    includeApprovedResultsInSlideshows?: boolean;
    resultSlideshowMode?: unknown;
  } } | null | undefined
): EventTryOnResultSlideshowMode {
  if (!event?.tryOn?.enabled) return 'disabled';

  if (isMode(event.tryOn.resultSlideshowMode)) {
    return event.tryOn.resultSlideshowMode;
  }

  return event.tryOn.includeApprovedResultsInSlideshows ? 'mixed_with_originals' : 'disabled';
}

export function shouldApprovedTryOnBeSlideshowEligible(
  event: { tryOn?: {
    enabled?: boolean;
    includeApprovedResultsInSlideshows?: boolean;
    resultSlideshowMode?: unknown;
  } } | null | undefined
): boolean {
  return normalizeEventTryOnResultSlideshowMode(event) !== 'disabled';
}

export function resolveSubmissionSourceModeForSlideshow(
  event: { tryOn?: {
    enabled?: boolean;
    includeApprovedResultsInSlideshows?: boolean;
    resultSlideshowMode?: unknown;
  } } | null | undefined,
  slideshow: Pick<Slideshow, 'submissionSourceMode'> | { submissionSourceMode?: unknown }
): SubmissionSourceMode {
  const mode = normalizeEventTryOnResultSlideshowMode(event);
  if (mode === 'approved_results_only') return 'approved_tryon_only';
  if (mode === 'mixed_with_originals') return 'originals_and_approved_tryon';
  if (mode === 'disabled') return 'originals_only';

  return slideshow.submissionSourceMode === 'approved_tryon_only'
    ? 'approved_tryon_only'
    : slideshow.submissionSourceMode === 'originals_and_approved_tryon'
      ? 'originals_and_approved_tryon'
      : 'originals_only';
}
