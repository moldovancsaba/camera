/**
 * Fetching a picture into memory and making its small preview. They lived in lib/tryon/frame-composition.ts, next to the try-on frame
 * composition, and the gallery frame and upload routes, photo vetting approval, the screen-picture generator and the preview backfill script used
 * them; they moved here when the try-on integration was removed (issue 557, docs/TRYON_REMOVED.md).
 */

import sharp from 'sharp';
import { uploadImage } from '@/lib/imgbb/upload';

const PREVIEW_MAX_DIMENSION = 480;

export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: 'image/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Downscales via sharp (aspect-preserving, no crop) rather than trusting imgbb's own
// undocumented thumb/medium generation — see LEARNINGS.md BACK-001 for why the latter
// was previously distrusted for framed result photos.
export async function uploadPreviewVariant(buffer: Buffer, uploadName: string): Promise<string | null> {
  try {
    const previewBuffer = await sharp(buffer, { failOn: 'none' })
      .resize({
        width: PREVIEW_MAX_DIMENSION,
        height: PREVIEW_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer();

    const upload = await uploadImage(previewBuffer.toString('base64'), {
      name: `${uploadName}-preview`,
      validatePublicUrl: false,
    });
    return upload.imageUrl;
  } catch (error) {
    console.warn('[uploadPreviewVariant] Failed to generate/upload preview image; grid views will fall back to full size.', {
      uploadName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
