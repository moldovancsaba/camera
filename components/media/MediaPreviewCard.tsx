'use client';

import {
  MediaPreviewCard as GdsMediaPreviewCard,
  type MediaPreviewAspectRatio,
} from '@doneisbetter/gds-core/client';

interface MediaPreviewCardProps {
  src: string;
  alt: string;
  caption?: string;
  action?: React.ReactNode;
  ratio?: number;
  fit?: 'contain' | 'cover';
  padding?: number;
}

function resolveAspectRatio(ratio: number): MediaPreviewAspectRatio {
  if (Math.abs(ratio - 16 / 9) < 0.01) {
    return '16:9';
  }

  if (Math.abs(ratio - 4 / 3) < 0.01) {
    return '4:3';
  }

  if (Math.abs(ratio - 3 / 4) < 0.01) {
    return '3:4';
  }

  return '1:1';
}

export default function MediaPreviewCard({
  src,
  alt,
  caption,
  action,
  ratio = 1,
  fit = 'contain',
}: MediaPreviewCardProps) {
  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <GdsMediaPreviewCard
        title={caption || alt}
        src={src}
        alt={alt}
        caption={caption ? alt : undefined}
        fit={fit}
        aspectRatio={resolveAspectRatio(ratio)}
        state="ready"
      />
      {action ? <div>{action}</div> : null}
    </div>
  );
}
