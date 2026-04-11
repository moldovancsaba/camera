/**
 * Archive Submission API
 * 
 * POST /api/admin/submissions/[submissionId]/archive
 * 
 * Archives a submission by setting isArchived: true. Archived submissions
 * are hidden from all active views but remain in the database and can be
 * restored later. They are only visible on the archived submissions page.
 * 
 * Auth: Requires admin session
 */

import { NextRequest, NextResponse } from 'next/server';
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

  // Check if already archived
  if (submission.isArchived) {
    throw apiBadRequest('Submission is already archived');
  }

  // Archive the submission
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .updateOne(
      { _id: new ObjectId(submissionId) },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: session.user.id,
          updatedAt: new Date().toISOString()
        }
      }
    );

  if (result.modifiedCount === 0) {
    throw new Error('Failed to archive submission');
  }

  // Get the updated submission
  const archivedSubmission = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });

  console.log(`✓ Archived submission ${submissionId} by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission archived successfully',
    submission: {
      _id: archivedSubmission?._id.toString(),
      imageUrl: archivedSubmission?.imageUrl,
      isArchived: true,
      archivedAt: archivedSubmission?.archivedAt,
      archivedBy: archivedSubmission?.archivedBy
    }
  });
});
