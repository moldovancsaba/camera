/**
 * The sample selfie (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): a picture of the Images library that is meant to fill the photo window of the welcome page screen (and, later, the
 * giant screen before its first photo). It is an ordinary library image with a **tag**, kept out of the general Images lists so the two libraries do not mix, and managed on its own pages
 * (Libraries, Sample selfies; the partner's and the event's Sample selfies panel). No separate collection: the same upload, the same file store, the same switch off and delete.
 */

import type { LibraryKind } from './kinds';

export const SAMPLE_SELFIE_TAG = 'sample-selfie';

/** The tags an upload request may carry: only the known ones; anything else is dropped. */
export function parseTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(list.filter((tag): tag is string => tag === SAMPLE_SELFIE_TAG))];
}

/**
 * The part of a library query that keeps sample selfies out of the general Images lists: only for the images kind. Every general list of images (the global library, a partner's, an
 * event's, what the picture fields choose from) adds it; the sample selfie lists ask for the tag instead.
 */
export function withoutSampleSelfies(kind: LibraryKind): Record<string, unknown> {
  return kind === 'images' ? { tags: { $ne: SAMPLE_SELFIE_TAG } } : {};
}

/** True when the image document is a sample selfie. */
export function isSampleSelfie(doc: { tags?: unknown } | null | undefined): boolean {
  return Array.isArray(doc?.tags) && (doc!.tags as unknown[]).includes(SAMPLE_SELFIE_TAG);
}
