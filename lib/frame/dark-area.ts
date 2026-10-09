/**
 * The dark area of a design in the shoot (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md, segment S5; owner, answer 193: one general method everywhere): the part of the picture the
 * design covers, shown at 50 % black while the user takes the photo and moves and zooms it, so the face stays clear of it. One method for every event and every kind of design:
 *
 * - a library frame with a message area, and the generated layout: the boxes of their layers (`territories`, drawn from the image the photo gets);
 * - a complete frame of the event's own: the whole non-transparent graphic at 50 % black (`frameSilhouette`), in the live view of a webcam and in the move-and-zoom step;
 * - the real frame is never shown before approval on a vetted event (camera#265), which is the same silhouette until the photo is approved.
 *
 * Pure: which image the camera step and the move-and-zoom step put over the photo for an own frame.
 */

export interface OverlayInput {
  /** The photo of a vetted event: the real frame is never shown. */
  vetted: boolean;
  /** The frame is a generated image or a frame with a message area: its dark area is territories, not an image. */
  generated: boolean;
  /** The picture of an own frame. */
  frameUrl: string | null;
  /** The 50 % black silhouette of that picture, once drawn; null while it is drawn or when the picture could not be read. */
  silhouetteUrl: string | null;
}

/**
 * The dark area image of an own frame, or null for none (territories, no picture, or a vetted event while the silhouette is drawn). Where the silhouette cannot be made (the picture
 * cannot be read) an event that is not vetted falls back to the real frame, as before the silhouette existed.
 */
export function darkAreaUrl({ vetted, generated, frameUrl, silhouetteUrl }: OverlayInput): string | null {
  if (generated || !frameUrl) return null;
  return vetted ? silhouetteUrl : (silhouetteUrl ?? frameUrl);
}
