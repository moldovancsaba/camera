/**
 * An image upload (camera#368): PNG, JPEG, WebP or SVG up to 4 MB, stored with its size in pixels read from the file with sharp (as the logo upload
 * does), plus who owns it. The id is `pictureId` (on a frame, `imageId` is the asset id of the imgbb mirror).
 */

import sharp from 'sharp';
import { generateId } from '@/lib/db/schemas';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES } from '../image-files';
import type { Uploader } from './types';

/** The size in pixels; 0 when it cannot be read (an SVG without a size), which must never stop an upload. */
async function pixelSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    return { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

export const imagesUploader: Uploader = {
  kind: 'images',
  fileTypes: IMAGE_FILE_TYPES,
  fileTypeWords: IMAGE_FILE_WORDS,
  maxBytes: IMAGE_MAX_BYTES,
  storeName: 'image',
  document: async (stored, fields, file) => ({
    pictureId: generateId(),
    name: fields.name,
    description: fields.description,
    imageUrl: stored.imageUrl,
    thumbnailUrl: stored.thumbnailUrl,
    ...(await pixelSize(file)),
    fileSize: stored.fileSize,
    mimeType: stored.mimeType,
    isActive: fields.isActive,
    createdBy: fields.createdBy,
    createdAt: fields.now,
    updatedAt: fields.now,
    ...fields.owner,
  }),
};
