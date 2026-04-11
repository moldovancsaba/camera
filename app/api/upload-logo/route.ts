/**
 * Logo Upload API
 * 
 * POST: Upload event/partner logo to imgbb
 * 
 * Why this exists:
 * - Client-side code cannot access IMGBB_API_KEY environment variable
 * - This server-side route securely handles imgbb uploads for admin forms
 */

import { NextRequest } from 'next/server';
import { uploadImage } from '@/lib/imgbb/upload';
import {
  withErrorHandler,
  requireAuth,
  apiCreated,
  apiBadRequest,
} from '@/lib/api';

/**
 * POST /api/upload-logo
 * Upload a logo image to imgbb
 * 
 * Body: { imageData: string (base64), name?: string }
 * Returns: { imageUrl, thumbnailUrl, deleteUrl, imageId }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Require authentication (admin only)
  await requireAuth();

  const body = await request.json();
  const { imageData, name } = body;

  if (!imageData) {
    throw apiBadRequest('Image data is required');
  }

  // Extract base64 data (remove data:image/png;base64, prefix if present)
  const base64Data = imageData.includes(',') 
    ? imageData.split(',')[1] 
    : imageData;

  // Upload to imgbb with optional custom name
  const uploadResult = await uploadImage(base64Data, {
    name: name || `logo-${Date.now()}`,
  });

  return apiCreated({
    imageUrl: uploadResult.imageUrl,
    thumbnailUrl: uploadResult.thumbnailUrl,
    deleteUrl: uploadResult.deleteUrl,
    imageId: uploadResult.imageId,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
  });
});
