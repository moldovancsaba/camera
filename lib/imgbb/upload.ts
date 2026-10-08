/**
 * Camera Image Upload
 *
 * Vercel Blob is the required primary image store. imgbb.com is kept only as
 * a best-effort secondary mirror, uploaded concurrently and never allowed to
 * fail the overall call -- imgbb has been observed closing high-volume
 * anonymous-API accounts and deleting their images without notice, so it can
 * no longer be trusted as the source of truth. This file keeps the `imgbb`
 * name/location since callers, DB fields, and the URL-validation module all
 * still reference it; only the upload strategy inside changed.
 *
 * API Documentation: https://vercel.com/docs/vercel-blob, https://api.imgbb.com
 */

import { put } from '@vercel/blob';
import axios, { AxiosError } from 'axios';
import sharp from 'sharp';
import { isRenderableImgbbImageUrl, normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
/** The mirror is a courtesy: a slow imgbb must not slow the caller, so the call waits this long for it at most (camera vetting approvals waited minutes for it). */
const DEFAULT_MIRROR_WAIT_MS = 5000;
const IMGBB_API_KEY_CANDIDATES = [
  'IMGBB_API_KEY',
  'NEXT_PUBLIC_IMG_BB_API_KEY',
  'IMG_BB_API_KEY',
] as const;

/**
 * Get imgbb API key if configured. imgbb is now an optional mirror, so a
 * missing key is a valid (if degraded) configuration, not an error.
 */
function getImgbbApiKey(): string | null {
  const found = IMGBB_API_KEY_CANDIDATES.map((key) => process.env[key]).find(
    (value) => Boolean(value?.trim())
  );
  return found ?? null;
}

/**
 * Upload response from imgbb.com API
 */
export interface ImgbbUploadResponse {
  success: boolean;
  data: {
    id: string;
    url_viewer: string;
    url: string;           // Direct image URL
    display_url: string;    // Display URL
    title: string;
    time: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;          // Full size image URL
      size: number;
    };
    thumb: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
      size: number;
    };
    medium?: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
      size: number;
    };
    delete_url: string;
  };
  status: number;
}

/**
 * Upload options
 */
export interface UploadOptions {
  name?: string;           // Optional custom name for the image (used as the Blob pathname prefix)
  expiration?: number;     // imgbb mirror only: expiration time in seconds (60-15552000)
  maxRetries?: number;     // imgbb mirror only: maximum number of retry attempts (default: 3)
  retryDelay?: number;     // imgbb mirror only: delay between retries in ms (default: 1000)
  validatePublicUrl?: boolean; // imgbb mirror only: validate final URL before returning (default: true)
  mirrorWaitMs?: number;   // How long the call waits for the imgbb mirror before it goes on without it (default: 5000)
}

/**
 * Upload result returned to caller
 */
export interface UploadResult {
  success: boolean;
  imageUrl: string;        // Direct Vercel Blob image URL (primary)
  thumbnailUrl: string;    // Same as imageUrl -- Blob has no separate thumbnail; next/image resizes on render
  deleteUrl: string;       // imgbb mirror's delete URL, or '' if the mirror didn't succeed
  imageId: string;         // imgbb mirror's image ID, or '' if the mirror didn't succeed
  fileSize: number;        // File size in bytes
  mimeType: string;        // MIME type (e.g., "image/jpeg")
  fileName: string;        // Generated filename
  provider: 'blob';        // Always 'blob' -- Blob is required, there is no fallback-to-imgbb-primary path
  mirrorImageUrl: string | null; // imgbb mirror URL when the best-effort mirror succeeded, else null
}

function collectUrlCandidates(payload: ImgbbUploadResponse['data']): string[] {
  return [
    payload.url,
    payload.image?.url,
    payload.display_url,
    payload.medium?.url,
    payload.thumb?.url,
  ]
    .map((value) => normalizeImgbbDirectUrl(value ?? null))
    .filter((value): value is string => Boolean(value));
}

async function canFetchImage(url: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      responseType: 'stream',
      headers: {
        Range: 'bytes=0-0',
        Accept: 'image/*',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    response.data?.destroy?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert File or Blob to base64 string. Read through `arrayBuffer()`: this module runs on the server, and Node has no FileReader (a File
 * passed here, as the library uploads do, failed with "FileReader is not defined").
 */
async function fileToBase64(file: File | Blob): Promise<string> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  if (!base64) {
    throw new Error('Invalid base64 image payload');
  }
  return base64;
}

function normalizeBase64Input(image: string): string {
  const trimmed = image.trim();
  if (!trimmed) {
    throw new Error('Invalid base64 image payload');
  }

  const isDataUrl = trimmed.startsWith('data:') && trimmed.includes('base64,');
  if (!isDataUrl) {
    return trimmed;
  }

  const separatorIndex = trimmed.indexOf('base64,');
  const payload = trimmed.slice(separatorIndex + 'base64,'.length);
  if (!payload) {
    throw new Error('Invalid base64 image payload');
  }
  return payload;
}

function isTransientAxiosError(error: AxiosError): boolean {
  if (!error.response) {
    return true;
  }

  const status = error.response.status;
  return status >= 500 || status === 429;
}

function sanitizePathnameSegment(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 120) || 'upload';
}

/**
 * Upload to Vercel Blob (required primary).
 *
 * addRandomSuffix keeps every upload's storage identity unique, matching
 * imgbb's old behavior where `name` was cosmetic and never caused
 * collisions -- callers that pass a stable `name` (e.g. re-framing the same
 * submission) get a fresh URL each time rather than overwriting in place.
 */
async function uploadToBlobPrimary(
  base64Image: string,
  name?: string
): Promise<{ imageUrl: string; fileSize: number; mimeType: string; fileName: string }> {
  const buffer = Buffer.from(base64Image, 'base64');
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
  // sharp names an SVG "svg"; a browser draws it in an <img> only when it is served as image/svg+xml.
  const mimeType = metadata.format === 'svg' ? 'image/svg+xml' : metadata.format ? `image/${metadata.format}` : 'application/octet-stream';
  const extension = metadata.format ?? 'bin';
  const fileName = `${sanitizePathnameSegment(name ?? 'upload')}.${extension}`;

  const blob = await put(fileName, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: mimeType,
  });

  return { imageUrl: blob.url, fileSize: buffer.byteLength, mimeType, fileName };
}

/**
 * Upload to imgbb.com (best-effort secondary mirror). Returns null -- never
 * throws past its own retry loop's final attempt -- so the caller can treat
 * a mirror failure as informational rather than fatal.
 */
async function uploadToImgbbMirror(
  base64Image: string,
  options: UploadOptions
): Promise<{ imageUrl: string; deleteUrl: string; imageId: string } | null> {
  const apiKey = getImgbbApiKey();
  if (!apiKey) {
    return null;
  }

  const {
    name,
    expiration,
    maxRetries = 3,
    retryDelay = 1000,
    validatePublicUrl = true,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`imgbb mirror upload attempt ${attempt}/${maxRetries}...`);

      const formData = new FormData();
      formData.append('key', apiKey);
      formData.append('image', base64Image);
      if (name) {
        formData.append('name', name);
      }
      if (expiration) {
        formData.append('expiration', expiration.toString());
      }

      const response = await axios.post<ImgbbUploadResponse>(
        IMGBB_UPLOAD_URL,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        }
      );

      if (!response.data.success) {
        throw new Error('imgbb API returned success: false');
      }

      const candidates = collectUrlCandidates(response.data.data);
      const imageUrl = candidates.find((value) => isRenderableImgbbImageUrl(value)) ?? null;
      if (!imageUrl) {
        throw new Error('imgbb response did not contain a valid direct image URL');
      }

      if (validatePublicUrl) {
        let validated = false;
        for (const candidate of [imageUrl, ...candidates.filter((value) => value !== imageUrl)]) {
          if (await canFetchImage(candidate)) {
            validated = true;
            break;
          }
        }
        if (!validated) {
          console.warn('imgbb mirror upload validation did not confirm fetchability; keeping unverified URL');
        }
      }

      console.log('✓ imgbb mirror upload successful:', response.data.data.id);
      return {
        imageUrl,
        deleteUrl: response.data.data.delete_url,
        imageId: response.data.data.id,
      };
    } catch (error) {
      lastError = error as Error;

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error(`✗ imgbb mirror upload attempt ${attempt} failed:`, {
          status: axiosError.response?.status,
          message: axiosError.message,
        });

        if (!isTransientAxiosError(axiosError)) {
          throw lastError;
        }
      } else {
        console.error(`✗ imgbb mirror upload attempt ${attempt} failed:`, error);
      }

      if (attempt < maxRetries) {
        const delay = retryDelay * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`Failed to upload image to imgbb mirror after ${maxRetries} attempts`);
}

/**
 * Upload image: Vercel Blob primary (required) + imgbb mirror (best-effort).
 *
 * @param image - File, Blob, or base64 string
 * @param options - Upload options (name, expiration, retries -- mirror only)
 * @returns Upload result; imageUrl/thumbnailUrl are always Blob URLs
 *
 * @throws Error if the Blob upload fails. A mirror failure never throws.
 */
export async function uploadImage(
  image: File | Blob | string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const base64Image = typeof image === 'string'
    ? normalizeBase64Input(image)
    : await fileToBase64(image);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const mirrorAttempt = uploadToImgbbMirror(base64Image, options).catch((error) => {
    console.warn(
      'imgbb mirror upload failed (non-fatal, Vercel Blob is primary):',
      error instanceof Error ? error.message : error
    );
    return null;
  });
  // The mirror gets a few seconds, then the call goes on without it. A late mirror result is dropped (its copy on imgbb is just an unused extra).
  const mirrorWait = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), options.mirrorWaitMs ?? DEFAULT_MIRROR_WAIT_MS);
  });
  const [blob, mirror] = await Promise.all([
    uploadToBlobPrimary(base64Image, options.name),
    Promise.race([mirrorAttempt, mirrorWait]).finally(() => clearTimeout(timer)),
  ]);

  return {
    success: true,
    imageUrl: blob.imageUrl,
    thumbnailUrl: blob.imageUrl,
    deleteUrl: mirror?.deleteUrl ?? '',
    imageId: mirror?.imageId ?? '',
    fileSize: blob.fileSize,
    mimeType: blob.mimeType,
    fileName: blob.fileName,
    provider: 'blob',
    mirrorImageUrl: mirror?.imageUrl ?? null,
  };
}

/**
 * Delete image from imgbb.com
 * Note: Requires the delete URL returned from upload
 *
 * @param deleteUrl - Delete URL from upload response
 * @returns True if deletion successful
 */
export async function deleteImage(deleteUrl: string): Promise<boolean> {
  try {
    await axios.get(deleteUrl, { timeout: 10000 });
    console.log('✓ imgbb image deleted successfully');
    return true;
  } catch (error) {
    console.error('✗ imgbb image deletion failed:', error);
    return false;
  }
}

