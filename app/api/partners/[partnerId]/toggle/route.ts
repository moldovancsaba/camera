/**
 * Partner API - Quick Toggle Active Status
 * 
 * PATCH: Toggle partner active/inactive status
 * Used for quick status changes from listing page without full update form
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import {
  requireAdmin,
  withErrorHandler,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';

/**
 * PATCH /api/partners/[id]/toggle
 * Toggle partner active/inactive status (global admin only)
 * 
 * This endpoint provides a quick way to toggle status from the listing page
 * without needing to load the full edit form, enabling better UX
 */
export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) => {
  await requireAdmin();

  const { partnerId } = await params;

  // Validate MongoDB ObjectId format
  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID');
  }

  const db = await connectToDatabase();
  
  // Get current partner to toggle its isActive state
  const partner = await db
    .collection(COLLECTIONS.PARTNERS)
    .findOne({ _id: new ObjectId(partnerId) });

  if (!partner) {
    throw apiNotFound('Partner');
  }

  // Toggle isActive status
  const newIsActive = !partner.isActive;

  // Update partner document
  const result = await db
    .collection(COLLECTIONS.PARTNERS)
    .findOneAndUpdate(
      { _id: new ObjectId(partnerId) },
      { 
        $set: { 
          isActive: newIsActive,
          updatedAt: generateTimestamp(),
        },
      },
      { returnDocument: 'after' }
    );

  return apiSuccess({
    success: true,
    partner: result,
    isActive: newIsActive,
  });
});
