import type { Submission } from '@/lib/db/schemas';

type SubmissionImageSource = Pick<Submission, 'imageUrl' | 'finalImageUrl' | 'originalImageUrl'>;

/**
 * Canonical public image URL for share, slideshow, and admin surfaces.
 * Prefers final composed output, then legacy imageUrl, then original capture.
 */
export function resolveSubmissionPublicImageUrl(
  submission: SubmissionImageSource | null | undefined
): string | null {
  if (!submission) return null;

  const candidates = [submission.finalImageUrl, submission.imageUrl, submission.originalImageUrl];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
