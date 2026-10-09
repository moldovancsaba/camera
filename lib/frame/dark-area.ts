/**
 * The dark area of a design in the shoot (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md, segment S5): the part of the picture the design covers, shown at 50 % black while the user
 * moves and zooms the photo, so the face stays clear of it. Four kinds of design, one rule each:
 *
 * - a library frame with a message area, and the generated layout: the boxes of their layers (`territories`, drawn from the image the photo gets);
 * - a complete frame of the event's own: the whole non-transparent graphic at 50 % black (`frameSilhouette`), the answer of the owner to question 189;
 * - the same silhouette for any own frame of a vetted event, whose real frame is never shown before approval (camera#265).
 *
 * Pure: which image the move-and-zoom step shows as an overlay.
 */

export interface OverlayInput {
  /** The photo of a vetted event: the real frame is never shown. */
  vetted: boolean;
  /** The editor saved how users get the layout and the message (epic 444): an own frame is a silhouette in the shoot for this event. */
  hasSelection: boolean;
  /** The frame is a generated image or a frame with a message area: its dark area is territories, not an image. */
  generated: boolean;
  /** The picture of an own frame. */
  frameUrl: string | null;
  /** The 50 % black silhouette of that picture, once drawn; null while it is drawn or when the picture could not be read. */
  silhouetteUrl: string | null;
}

/** The image the move-and-zoom step puts over the photo for an own frame, or null for none (territories, or nothing yet). */
export function reframeOverlayUrl({ vetted, hasSelection, generated, frameUrl, silhouetteUrl }: OverlayInput): string | null {
  if (generated || !frameUrl) return null;
  if (vetted) return silhouetteUrl;
  if (hasSelection) return silhouetteUrl ?? frameUrl;
  return frameUrl;
}

/** Whether the silhouette of an own frame has to be drawn at all. */
export const needsSilhouette = (input: Pick<OverlayInput, 'vetted' | 'hasSelection'>): boolean => input.vetted || input.hasSelection;
