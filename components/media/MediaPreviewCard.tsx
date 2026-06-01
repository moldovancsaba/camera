'use client';

import Image from 'next/image';
import { AspectRatio, Box } from '@mantine/core';
import { MediaCard as GdsMediaCard } from '@doneisbetter/gds-core/client';

interface MediaPreviewCardProps {
  src: string;
  alt: string;
  caption?: string;
  action?: React.ReactNode;
  ratio?: number;
  fit?: 'contain' | 'cover';
  padding?: number;
}

export default function MediaPreviewCard({
  src,
  alt,
  caption,
  action,
  ratio = 1,
  fit = 'contain',
  padding = 24,
}: MediaPreviewCardProps) {
  return (
    <GdsMediaCard
      title={caption || alt}
      description={caption ? alt : undefined}
      image={
        <AspectRatio ratio={ratio}>
          <Box style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            <Image
              src={src}
              alt={alt}
              fill
              unoptimized
              style={{ objectFit: fit, padding }}
            />
          </Box>
        </AspectRatio>
      }
      overlay={action}
    />
  );
}
