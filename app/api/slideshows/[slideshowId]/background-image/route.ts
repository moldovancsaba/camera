/**
 * Admin: upload a slideshow failover background image (stored on imgbb, URL on slideshow doc).
 *
 * POST multipart/form-data: file (image, required)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import {
  withErrorHandler,
  requireAdmin,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';

const MAX_BYTES = 32 * 1024 * 1024;

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ slideshowId: string }> }
  ) => {
    await requireAdmin(request);
    await checkRateLimit(request, RATE_LIMITS.UPLOAD);

    const { slideshowId } = await context.params;
    if (!slideshowId?.trim()) {
      throw apiBadRequest('slideshowId is required');
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      throw apiBadRequest('Image file is required');
    }

    if (!(file instanceof File)) {
      throw apiBadRequest('Invalid file upload');
    }

    if (!file.type.startsWith('image/')) {
      throw apiBadRequest('File must be an image');
    }

    if (file.size > MAX_BYTES) {
      throw apiBadRequest(`Image must be under ${MAX_BYTES / 1024 / 1024} MB`);
    }

    const db = await connectToDatabase();
    const slideshow = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOne({ slideshowId: slideshowId.trim() });

    if (!slideshow) {
      throw apiNotFound('Slideshow not found');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    const uploadResult = await uploadImage(base64, {
      name: `slideshow-bg-${slideshowId}-${Date.now()}`,
    });

    const now = generateTimestamp();
    await db.collection(COLLECTIONS.SLIDESHOWS).updateOne(
      { slideshowId: slideshowId.trim() },
      { $set: { backgroundImageUrl: uploadResult.imageUrl, updatedAt: now } }
    );

    return apiCreated({
      imageUrl: uploadResult.imageUrl,
      thumbnailUrl: uploadResult.thumbnailUrl,
    });
  }
);
