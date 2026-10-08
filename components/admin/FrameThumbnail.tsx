'use client';

/**
 * The picture of a frame in the admin lists (event frames, partner library, the style panel): its thumbnail or the frame itself, or "No picture"
 * (owner, 2026-10-08: visual elements have to be visible). The drawing is the shared one of the libraries (library/AssetThumbnail).
 */

import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import { frameThumbnailUrl } from '@/lib/frames/thumbnail';

interface FrameThumbnailProps {
  frame: { name?: string | null; thumbnailUrl?: string | null; imageUrl?: string | null } | null | undefined;
  /** CSS width of the picture: a number of pixels, or a length such as "100%". The picture is 16:9, the shape of every frame. */
  width?: number | string;
}

export default function FrameThumbnail({ frame, width = 160 }: FrameThumbnailProps) {
  return <AssetThumbnail url={frameThumbnailUrl(frame)} name={frame?.name} noun="frame" width={width} />;
}
