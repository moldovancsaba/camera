/**
 * The stadium background (issue 326, plan item 1; docs/SCREEN_DESIGN.md): a picture of the Images library that the stage of an event's default slideshow can be drawn on, with the event's colours
 * over it. Like the sample selfie (lib/library/sample-selfie.ts) it is an ordinary library image with a **tag**, kept out of the general Images lists and managed on its own pages (Libraries,
 * Stadium backgrounds; the partner's and the event's panel). No separate collection: the same upload, the same file store, the same switch off and delete.
 */

export const STADIUM_BACKGROUND_TAG = 'stadium-background';

/** True when the image document is a stadium background. */
export function isStadiumBackground(doc: { tags?: unknown } | null | undefined): boolean {
  return Array.isArray(doc?.tags) && (doc!.tags as unknown[]).includes(STADIUM_BACKGROUND_TAG);
}
