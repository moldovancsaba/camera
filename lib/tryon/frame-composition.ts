import sharp from 'sharp';
import { uploadImage, type UploadResult } from '@/lib/imgbb/upload';

export interface TryOnResultAsset {
  publicResultUrl: string;
  deleteUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  compositionEngine: string;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
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

function buildUploadAsset(upload: UploadResult, width: number | null, height: number | null): TryOnResultAsset {
  return {
    publicResultUrl: upload.imageUrl,
    deleteUrl: upload.deleteUrl ?? null,
    fileSize: upload.fileSize ?? null,
    mimeType: upload.mimeType ?? null,
    width,
    height,
    compositionEngine: 'motogp_leather_magic_framed',
  };
}

export async function inspectTryOnResultAsset(publicResultUrl: string): Promise<TryOnResultAsset> {
  const resultBuffer = await fetchImageBuffer(publicResultUrl);
  const metadata = await sharp(resultBuffer, { failOn: 'none' }).metadata();

  return {
    publicResultUrl,
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
  uploadName: string
): Promise<TryOnResultAsset> {
  const [resultBuffer, frameBuffer] = await Promise.all([
    fetchImageBuffer(publicResultUrl),
    fetchImageBuffer(frameUrl),
  ]);

  const resultMetadata = await sharp(resultBuffer, { failOn: 'none' }).metadata();
  const width = resultMetadata.width ?? null;
  const height = resultMetadata.height ?? null;

  if (!width || !height) {
    throw new Error('Try-on result dimensions could not be determined');
  }

  const resizedFrameBuffer = await sharp(frameBuffer, { failOn: 'none', density: 300 })
    .resize({
      width,
      height,
      fit: 'fill',
    })
    .png()
    .toBuffer();

  const composedBuffer = await sharp(resultBuffer, { failOn: 'none' })
    .composite([{ input: resizedFrameBuffer, blend: 'over' }])
    .png()
    .toBuffer();

  const upload = await uploadImage(composedBuffer.toString('base64'), {
    name: uploadName,
  });

  return buildUploadAsset(upload, width, height);
}
