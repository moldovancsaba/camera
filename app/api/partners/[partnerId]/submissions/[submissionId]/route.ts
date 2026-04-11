/**
 * Remove Submission from Partner API
 * 
 * DELETE /api/partners/[partnerId]/submissions/[submissionId]
 * 
 * Hides a submission from a partner and all its events by setting
 * hiddenFromPartner: true and clearing all eventIds. The submission
 * remains in the database but is hidden from partner-level views.
 * 
 * Auth: Requires admin session
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api';

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ partnerId: string; submissionId: string }> }
) => {
  // Auth: Admin only
  const session = await requireAdmin();

  const { partnerId, submissionId } = await context!.params!;

  // Validate ObjectId format
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const db = await connectToDatabase();

  // Find the submission
  const submission = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });

  if (!submission) {
    throw apiNotFound('Submission not found');
  }

  // Verify submission belongs to this partner
  if (submission.partnerId !== partnerId) {
    throw apiBadRequest('Submission does not belong to this partner');
  }

  // Hide from partner: set hiddenFromPartner flag and clear eventIds
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .updateOne(
      { _id: new ObjectId(submissionId) },
      {
        $set: {
          hiddenFromPartner: true,
          eventIds: [], // Clear all event associations
          updatedAt: new Date().toISOString()
        }
      }
    );

  if (result.modifiedCount === 0) {
    throw new Error('Failed to update submission');
  }

  // Count remaining visible submissions for this partner
  const remainingCount = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .countDocuments({
      partnerId: partnerId,
      isArchived: false,
      hiddenFromPartner: false
    });

  console.log(`✓ Removed submission ${submissionId} from partner ${partnerId} by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission removed from partner and all its events',
    remainingSubmissions: remainingCount
  });
});
