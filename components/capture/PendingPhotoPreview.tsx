'use client';

/**
 * The guest's own photo with the 50% black shapes where the frame will go (camera#265, docs/PHOTO_VETTING_PLAN.md): shown instead of the
 * framed result while the photo of a vetted event waits for approval. Fills its positioned parent and keeps the photo's shape, so the
 * shapes sit exactly over the picture.
 */

import Image from 'next/image';
import FrameTerritories from '@/components/capture/FrameTerritories';
import type { Territory } from '@/lib/frame/capture';

interface PendingPhotoPreviewProps {
  photoUrl: string;
  /** Width over height of the photo. */
  aspect: number;
  /** Boxes of the generated frame's layers. */
  territories?: readonly Territory[];
  /** An own frame as a 50% black silhouette (a PNG data URL). */
  silhouetteUrl?: string | null;
  alt: string;
}

export default function PendingPhotoPreview({ photoUrl, aspect, territories, silhouetteUrl, alt }: PendingPhotoPreviewProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ containerType: 'size' }} data-pending-photo-preview>
      <div className="relative" style={{ aspectRatio: String(aspect), width: `min(100cqw, calc(100cqh * ${aspect}))` }}>
        <Image src={photoUrl} alt={alt} fill unoptimized className="object-contain" />
        {silhouetteUrl && (
          <Image src={silhouetteUrl} alt="" aria-hidden="true" fill unoptimized className="pointer-events-none object-fill" data-frame-silhouette />
        )}
        {territories && territories.length > 0 && <FrameTerritories territories={territories} />}
      </div>
    </div>
  );
}
