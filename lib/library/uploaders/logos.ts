/**
 * A logo upload (camera#367): the same file types and stored shape as the global logo upload (`POST /api/logos`), plus who owns it. The size is read
 * from the file with sharp, best-effort as there: an unusual file (an SVG without an intrinsic size) is stored with 0 x 0 rather than refused.
 */

import sharp from 'sharp';
import { generateId } from '@/lib/db/schemas';
import type { Uploader } from './types';

async function measure(file: File): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    return { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

export const logosUploader: Uploader = {
  kind: 'logos',
  fileTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'],
  fileTypeWords: 'PNG, JPG, SVG and WebP',
  storeName: 'logo',
  document: async (stored, fields, file) => ({
    logoId: generateId(),
    name: fields.name,
    description: fields.description,
    imageUrl: stored.imageUrl,
    thumbnailUrl: stored.thumbnailUrl,
    ...(await measure(file)),
    fileSize: stored.fileSize,
    mimeType: stored.mimeType,
    isActive: fields.isActive,
    usageCount: 0,
    createdBy: fields.createdBy,
    createdAt: fields.now,
    updatedAt: fields.now,
    ...fields.owner,
  }),
};
