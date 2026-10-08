/** A frame upload: the same file types and stored shape as the global frame upload (`POST /api/frames`), plus who owns it. */

import { generateId } from '@/lib/db/schemas';
import type { Uploader } from './types';

export const framesUploader: Uploader = {
  kind: 'frames',
  fileTypes: ['image/png', 'image/svg+xml'],
  fileTypeWords: 'PNG and SVG',
  storeName: 'frame',
  document: (stored, fields) => ({
    frameId: generateId(),
    name: fields.name,
    description: fields.description,
    category: fields.category,
    imageUrl: stored.imageUrl,
    deleteUrl: stored.deleteUrl,
    imageId: stored.imageId,
    fileSize: stored.fileSize,
    mimeType: stored.mimeType,
    isActive: fields.isActive,
    createdBy: fields.createdBy,
    createdAt: fields.now,
    updatedAt: fields.now,
    ...fields.owner,
  }),
};
