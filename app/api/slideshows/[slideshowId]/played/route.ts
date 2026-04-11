/**
 * Slideshow Play Count Tracking API
 *
 * POST: Update play counts for submissions that were displayed
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import {
  withErrorHandler,
  checkRateLimit,
  RATE_LIMITS,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';

/**
 * POST /api/slideshows/[slideshowId]/played
 * Body: { submissionIds: string[] }
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ slideshowId: string }> }
  ) => {
    await checkRateLimit(request, RATE_LIMITS.SLIDESHOW_PLAYED);

    const { slideshowId } = await params;
    const body = await request.json();
    const { submissionIds } = body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      throw apiBadRequest('submissionIds array is required');
    }

    const db = await connectToDatabase();

    const slideshow = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOne({ slideshowId });

    if (!slideshow) {
      throw apiNotFound('Slideshow not found');
    }

    const objectIds = submissionIds
      .filter((id: string) => ObjectId.isValid(id))
      .map((id: string) => new ObjectId(id));

    if (objectIds.length === 0) {
      throw apiBadRequest('No valid submission IDs provided');
    }

    const now = generateTimestamp();

    const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
      { _id: { $in: objectIds } },
      {
        $inc: {
          playCount: 1,
          [`slideshowPlays.${slideshowId}.count`]: 1,
        },
        $set: {
          lastPlayedAt: now,
          [`slideshowPlays.${slideshowId}.lastPlayedAt`]: now,
        },
      }
    );

    return apiSuccess({
      updatedCount: result.modifiedCount,
    });
  }
);
