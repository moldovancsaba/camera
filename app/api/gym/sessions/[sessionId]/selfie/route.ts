/**
 * Attach a gym workout selfie: same imgbb upload path as photo submissions.
 * The client sends a JPEG data URL that already includes the FunFitFan default frame when configured.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';
import { assertGymAppAccess } from '@/lib/gym/access';

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ sessionId: string }> }) => {
    await checkRateLimit(request, RATE_LIMITS.UPLOAD);

    const session = await requireAuth();
    assertGymAppAccess(session);
    const { sessionId } = await context.params;

    const body = await request.json();
    const { imageData } = body;
    if (!imageData || typeof imageData !== 'string') {
      throw apiBadRequest('imageData is required (base64 data URL or raw base64)');
    }

    const db = await connectToDatabase();
    const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (!row) {
      throw apiNotFound('Session');
    }
    if (row.userId !== session.user.id) {
      throw apiForbidden('Not your session');
    }

    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const uploadResult = await uploadImage(base64Data, {
      name: `gym-selfie-${sessionId}-${Date.now()}`,
    });

    const now = generateTimestamp();
    await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).updateOne(
      { sessionId },
      {
        $set: {
          selfieImageUrl: uploadResult.imageUrl,
          selfieUploadedAt: now,
          updatedAt: now,
        },
      }
    );

    const next = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    return apiSuccess({
      session: {
        ...next,
        _id: next?._id?.toString(),
      },
      imageUrl: uploadResult.imageUrl,
    });
  }
);
