/**
 * Migration API: Add frameId to Existing Frames
 * 
 * POST /api/admin/migrate-frames
 * Adds frameId to any frames that don't have one
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId } from '@/lib/db/schemas';
import { withErrorHandler, requireAdmin, apiSuccess } from '@/lib/api';

export const POST = withErrorHandler(async (request: NextRequest) => {
  // Require admin authentication
  await requireAdmin();

  const db = await connectToDatabase();
  const framesCollection = db.collection(COLLECTIONS.FRAMES);

  // Find all frames without frameId
  const framesWithoutId = await framesCollection.find({ frameId: { $exists: false } }).toArray();

  const results = [];

  // Add frameId to each frame
  for (const frame of framesWithoutId) {
    const frameId = generateId();
    
    await framesCollection.updateOne(
      { _id: frame._id },
      { 
        $set: { 
          frameId,
          updatedAt: new Date().toISOString()
        } 
      }
    );
    
    results.push({
      name: frame.name,
      frameId,
    });
  }

  return apiSuccess({
    message: `Added frameId to ${results.length} frames`,
    migrated: results,
  });
});
