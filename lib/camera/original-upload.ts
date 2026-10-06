/**
 * Uploads the full-frame original straight from the browser to Vercel Blob (camera#210), using a
 * short-lived token from POST /api/uploads/original. It never throws and never blocks a save for
 * long: two retries with a short pause, then null, in which case the submission is saved without
 * the original (the framed photo is what matters to the fan). The uploader is injectable so the
 * logic is unit-tested without a network (original-upload.test.ts).
 */

import { upload } from '@vercel/blob/client';
import { ORIGINAL_ALLOWED_TYPE, ORIGINAL_UPLOAD_ENDPOINT, originalPathPrefix } from '@/lib/submissions/original-image';
import type { FullFrameCapture } from './frame-capture';

export interface UploadedOriginal {
  url: string;
  width: number;
  height: number;
}

export type OriginalUploader = (
  pathname: string,
  body: Blob,
  options: { handleUploadUrl: string; clientPayload: string; contentType: string }
) => Promise<{ url: string }>;

/** Pauses before the second and third attempt. */
export const ORIGINAL_UPLOAD_RETRY_DELAYS_MS = [600, 1800];

const blobUploader: OriginalUploader = (pathname, body, options) =>
  upload(pathname, body, { access: 'public', ...options });

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function randomName(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function uploadOriginal(
  capture: FullFrameCapture,
  eventId: string,
  deps: { uploader?: OriginalUploader; sleep?: (ms: number) => Promise<void> } = {}
): Promise<UploadedOriginal | null> {
  const uploader = deps.uploader ?? blobUploader;
  const sleep = deps.sleep ?? defaultSleep;
  const pathname = `${originalPathPrefix(eventId)}${randomName()}.jpg`;
  const options = {
    handleUploadUrl: ORIGINAL_UPLOAD_ENDPOINT,
    clientPayload: JSON.stringify({ eventId }),
    contentType: ORIGINAL_ALLOWED_TYPE,
  };

  for (let attempt = 0; attempt <= ORIGINAL_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await uploader(pathname, capture.blob, options);
      return { url: result.url, width: capture.width, height: capture.height };
    } catch (error) {
      if (attempt === ORIGINAL_UPLOAD_RETRY_DELAYS_MS.length) {
        console.warn('Could not upload the full-frame original; saving without it.', error);
        return null;
      }
      await sleep(ORIGINAL_UPLOAD_RETRY_DELAYS_MS[attempt]);
    }
  }
  return null;
}
