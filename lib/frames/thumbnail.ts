/**
 * The picture to show for a frame in the admin lists. Frames of the library carry `imageUrl` (the frame itself); a separate `thumbnailUrl` has never
 * been stored for them, so the lists that looked only for `thumbnailUrl` printed the word "Image" instead of the picture (owner, 2026-10-08). A
 * thumbnail wins when there is one, else the frame's own picture; null only when the frame has neither.
 */
export function frameThumbnailUrl(frame: { thumbnailUrl?: string | null; imageUrl?: string | null } | null | undefined): string | null {
  for (const candidate of [frame?.thumbnailUrl, frame?.imageUrl]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}
