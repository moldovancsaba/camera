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
  uploadName: string,
  frameWidth?: number | null,
  frameHeight?: number | null
): Promise<TryOnResultAsset> {
  const [resultBuffer, frameBuffer] = await Promise.all([
    fetchImageBuffer(publicResultUrl),
    fetchImageBuffer(frameUrl),
  ]);

  const resultMetadata = await sharp(resultBuffer, { failOn: 'none' }).metadata();
  const sourceWidth = resultMetadata.width ?? null;
  const sourceHeight = resultMetadata.height ?? null;
  const hasFrameDimensions = Number.isFinite(frameWidth ?? NaN) && Number(frameWidth) > 0
    && Number.isFinite(frameHeight ?? NaN) && Number(frameHeight) > 0;
  const normalizedFrameWidth = hasFrameDimensions ? Math.round(frameWidth as number) : null;
  const normalizedFrameHeight = hasFrameDimensions ? Math.round(frameHeight as number) : null;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Try-on result dimensions could not be determined');
  }

  const outputWidth = normalizedFrameWidth ?? sourceWidth;
  const outputHeight = normalizedFrameHeight ?? sourceHeight;
  const sourceImage = hasFrameDimensions
    ? await sharp(resultBuffer, { failOn: 'none' })
      .resize({
        width: normalizedFrameWidth!,
        height: normalizedFrameHeight!,
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toBuffer()
    : resultBuffer;

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

  const upload = await uploadImage(composedBuffer.toString('base64'), {
    name: uploadName,
  });

  return buildUploadAsset(upload, outputWidth, outputHeight);
}
