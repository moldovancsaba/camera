'use client';

/**
 * The picture of a library item (frame, logo, image) in the admin lists. It shows the picture on a neutral grey so a transparent item (a frame
 * with a clear middle, a logo with no background) is visible; an item with no picture says so in plain words, never a bare "Image"
 * (owner, 2026-10-08: visual elements have to be visible). One component for every list of every library (camera#361).
 */

import Image from 'next/image';

interface AssetThumbnailProps {
  url: string | null | undefined;
  name?: string | null;
  /** What the item is, for the texts: "frame", "logo", "image". */
  noun?: string;
  /** CSS width of the picture: a number of pixels, or a length such as "100%". The box is 16:9; the picture is shown whole inside it. */
  width?: number | string;
  /** Called when the address does not give a picture (the picture picker says so). */
  onError?: () => void;
}

const BOX = { aspectRatio: '16 / 9', background: 'var(--mantine-color-gray-3)', borderRadius: 6, overflow: 'hidden' as const, flex: 'none' as const };

export default function AssetThumbnail({ url, name, noun = 'item', width = 160, onError }: AssetThumbnailProps) {
  const size = typeof width === 'number' ? `${width}px` : width;
  if (!url) {
    return (
      <div role="img" aria-label={`This ${noun} has no picture`} style={{ ...BOX, width: size, display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', textAlign: 'center' }}>
        No picture
      </div>
    );
  }
  return (
    <div style={{ ...BOX, width: size }}>
      <Image src={url} alt={name || noun} width={320} height={180} unoptimized onError={onError} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}
