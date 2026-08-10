/**
 * Try-On Frame Composition
 *
 * Provides two exported functions:
 *
 * - `inspectTryOnResultAsset(url)` — fetches the result image, reads its
 *   dimensions and MIME type, and returns a `TryOnResultAsset`. If the fetch
 *   fails (e.g. a non-existent or unreachable URL used in E2E tests) the
 *   function degrades gracefully: a warning is logged and an asset with null
 *   dimensions is returned. Completion records are always written.
 *
 * - `applyFrameToTryOnResult(resultUrl, frameUrl, ...)` — composites a
 *   try-on result with an event frame using sharp, uploads the composed image
 *   to imgbb, and returns the final `TryOnResultAsset`.
 */

import sharp from 'sharp';
import { uploadImage, type UploadResult } from '@/lib/imgbb/upload';

export interface TryOnResultAsset {
  publicResultUrl: string;
  previewUrl: string | null;
  deleteUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  compositionEngine: string;
}

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

function buildUploadAsset(
  upload: UploadResult,
  previewUrl: string | null,
  width: number | null,
  height: number | null
): TryOnResultAsset {
  return {
    publicResultUrl: upload.imageUrl,
    previewUrl,
    deleteUrl: upload.deleteUrl ?? null,
    fileSize: upload.fileSize ?? null,
    mimeType: upload.mimeType ?? null,
    width,
    height,
    compositionEngine: 'motogp_leather_magic_framed',
  };
}

export async function inspectTryOnResultAsset(publicResultUrl: string): Promise<TryOnResultAsset> {
  let resultBuffer: Buffer;
  try {
    resultBuffer = await fetchImageBuffer(publicResultUrl);
  } catch (fetchError) {
    // Gracefully degrade when the image URL is unreachable (e.g. a non-existent
    // URL used in E2E tests or a transient network failure). The completion
    // record is still written with null dimensions — which is acceptable for
    // a pending-review result that a moderator will inspect manually.
    console.warn('[inspectTryOnResultAsset] Could not fetch result image; storing without metadata.', {
      publicResultUrl,
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    });
    return {
      publicResultUrl,
      previewUrl: null,
      deleteUrl: null,
      fileSize: null,
      mimeType: null,
      width: null,
      height: null,
      compositionEngine: 'motogp_leather_magic',
    };
  }

  const [metadata, previewUrl] = await Promise.all([
    sharp(resultBuffer, { failOn: 'none' }).metadata(),
    uploadPreviewVariant(resultBuffer, `tryon-preview-${Date.now()}`),
  ]);

  return {
    publicResultUrl,
    previewUrl,
    deleteUrl: null,
    fileSize: resultBuffer.byteLength || null,
    mimeType: metadata.format ? `image/${metadata.format}` : null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    compositionEngine: 'motogp_leather_magic',
  };
}


export async function applyFrameToTryOnResult(
  publicResultUrl: string,
  frameUrl: string,
  uploadName: string,
  frameWidth?: number | null,
  frameHeight?: number | null
): Promise<TryOnResultAsset> {
  const [resultBuffer, frameBuffer] = await Promise.all([
    fetchImageBuffer(publicResultUrl),
    fetchImageBuffer(frameUrl),
  ]);

  const resultMetadata = await sharp(resultBuffer, { failOn: 'none' }).metadata();
  const frameMetadata = await sharp(frameBuffer, { failOn: 'none', density: 300 }).metadata();
  const sourceWidth = resultMetadata.width ?? null;
  const sourceHeight = resultMetadata.height ?? null;
  const hasFrameDimensions = Number.isFinite(frameWidth ?? NaN) && Number(frameWidth) > 0
    && Number.isFinite(frameHeight ?? NaN) && Number(frameHeight) > 0;
  const normalizedFrameWidth = hasFrameDimensions ? Math.round(frameWidth as number) : null;
  const normalizedFrameHeight = hasFrameDimensions ? Math.round(frameHeight as number) : null;
  const finalFrameWidth = normalizedFrameWidth ?? (frameMetadata.width ?? null);
  const finalFrameHeight = normalizedFrameHeight ?? (frameMetadata.height ?? null);

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Try-on result dimensions could not be determined');
  }
  if (!finalFrameWidth || !finalFrameHeight) {
    throw new Error('Frame dimensions could not be determined');
  }

  const outputWidth = Math.round(finalFrameWidth);
  const outputHeight = Math.round(finalFrameHeight);
  const sourceImage = await sharp(resultBuffer, { failOn: 'none' })
    .resize({
      width: outputWidth,
      height: outputHeight,
      fit: 'cover',
      position: 'center',
    })
    .png()
    .toBuffer();

  const resizedFrameBuffer = await sharp(frameBuffer, { failOn: 'none', density: 300 })
    .resize({
      width: outputWidth,
      height: outputHeight,
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const composedBuffer = await sharp(sourceImage, { failOn: 'none' })
    .composite([{ input: resizedFrameBuffer, blend: 'over' }])
    .png()
    .toBuffer();

  const [upload, previewUrl] = await Promise.all([
    uploadImage(composedBuffer.toString('base64'), { name: uploadName }),
    uploadPreviewVariant(composedBuffer, uploadName),
  ]);

  return buildUploadAsset(upload, previewUrl, outputWidth, outputHeight);
}
