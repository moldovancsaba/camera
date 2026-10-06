import type { Submission } from '@/lib/db/schemas';

type SubmissionImageSource = Pick<Submission, 'imageUrl' | 'finalImageUrl' | 'originalImageUrl' | 'reframe'>;

/**
 * Canonical public image URL for share, slideshow, and admin surfaces.
 * Prefers final composed output, then legacy imageUrl, then original capture. A submission with a
 * `reframe` record has a distinct full-frame original (camera#210), which is never public, so the
 * original is only a fallback for older submissions where it is the composite itself.
 */
export function resolveSubmissionPublicImageUrl(
  submission: SubmissionImageSource | null | undefined
): string | null {
  if (!submission) return null;

  const candidates = [
    submission.finalImageUrl,
    submission.imageUrl,
    ...(submission.reframe ? [] : [submission.originalImageUrl]),
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
