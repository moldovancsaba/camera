'use client';

/**
 * The picture of a frame in the admin lists (event frames, partner defaults, the style panel). It shows the frame's thumbnail or the frame itself, on a
 * neutral grey so a transparent frame (a band at the top and the bottom, a clear middle) is visible; when a frame has no picture at all it says so in
 * plain words, never a bare "Image" (owner, 2026-10-08: visual elements have to be visible).
 */

import Image from 'next/image';
import { frameThumbnailUrl } from '@/lib/frames/thumbnail';

interface FrameThumbnailProps {
  frame: { name?: string | null; thumbnailUrl?: string | null; imageUrl?: string | null } | null | undefined;
  /** CSS width of the picture: a number of pixels, or a length such as "100%". The picture is 16:9, the shape of every frame. */
  width?: number | string;
}

const BOX = { aspectRatio: '16 / 9', background: 'var(--mantine-color-gray-3)', borderRadius: 6, overflow: 'hidden' as const, flex: 'none' as const };

export default function FrameThumbnail({ frame, width = 160 }: FrameThumbnailProps) {
  const url = frameThumbnailUrl(frame);
  const size = typeof width === 'number' ? `${width}px` : width;
  if (!url) {
    return (
      <div role="img" aria-label="This frame has no picture" style={{ ...BOX, width: size, display: 'grid', placeItems: 'center', color: 'var(--gds-color-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
        No picture
      </div>
    );
  }
  return (
    <div style={{ ...BOX, width: size }}>
      <Image src={url} alt={frame?.name || 'Frame'} width={320} height={180} unoptimized style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}
