/**
 * Restore Archived Submission API
 * 
 * POST /api/admin/submissions/[submissionId]/restore
 * 
 * Restores an archived submission by setting isArchived: false and clearing
 * archive metadata. The submission becomes visible again, but eventIds remain
 * empty until manually re-added to events.
 * 
 * Auth: Requires admin session
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api';

export const POST = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ submissionId: string }> }
) => {
  // Auth: Admin only
  const session = await requireAdmin();

  const { submissionId } = await context!.params!;

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

  // Check if not archived
  if (!submission.isArchived) {
    throw apiBadRequest('Submission is not archived');
  }

  // Restore the submission
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .updateOne(
      { _id: new ObjectId(submissionId) },
      {
        $set: {
          isArchived: false,
          updatedAt: new Date().toISOString()
        },
        $unset: {
          archivedAt: '',
          archivedBy: ''
        }
      }
    );

  if (result.modifiedCount === 0) {
    throw new Error('Failed to restore submission');
  }

  // Get the updated submission
  const restoredSubmission = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });

  console.log(`✓ Restored submission ${submissionId} by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission restored successfully',
    submission: {
      _id: restoredSubmission?._id.toString(),
      imageUrl: restoredSubmission?.imageUrl,
      isArchived: false,
      eventIds: restoredSubmission?.eventIds || []
    }
  });
});
