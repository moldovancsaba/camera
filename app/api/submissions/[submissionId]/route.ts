/**
 * Permanent Delete Submission API
 * 
 * DELETE /api/submissions/[submissionId]
 * 
 * Permanently deletes a submission from the database. This action cannot be
 * undone. Users can only delete their own submissions (verified by userId).
 * Admins can delete any submission.
 * 
 * Note: Images on imgbb.com are not deleted, only the database record.
 * 
 * Auth: Requires user session (must own submission OR be admin)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound, apiForbidden } from '@/lib/api';

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context?: { params?: Promise<{ submissionId: string }> }
) => {
  // Auth: Must be authenticated
  const session = await requireAuth();

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

  // Authorization check: User must own the submission OR be admin
  const isOwner = submission.userId === session.user.id;
  // Check app-specific role (appRole), not SSO-level role (user.role)
  const isAdmin = session.appRole === 'admin' || session.appRole === 'superadmin';
  
  if (!isOwner && !isAdmin) {
    throw apiForbidden('You can only delete your own submissions');
  }

  // Permanently delete the submission
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .deleteOne({ _id: new ObjectId(submissionId) });

  if (result.deletedCount === 0) {
    throw new Error('Failed to delete submission');
  }

  console.log(`✓ Permanently deleted submission ${submissionId} by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission deleted permanently',
    deletedId: submissionId
  });
});
