/**
 * Remove Submission from Event API
 * 
 * DELETE /api/events/[eventId]/submissions/[submissionId]
 * 
 * Removes a submission from a specific event by removing the eventId from
 * the submission's eventIds array. The submission remains in the database
 * and can be re-added to the event later.
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
  context?: { params?: Promise<{ eventId: string; submissionId: string }> }
) => {
  // Auth: Admin only
  const session = await requireAdmin();

  const { eventId, submissionId } = await context!.params!;

  // Validate ObjectId format
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID format');
  }

  const db = await connectToDatabase();

  // CRITICAL: eventId in URL is MongoDB _id, but submissions store event UUID
  // First, get the event to find its UUID eventId field
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) });

  if (!event) {
    throw apiNotFound('Event not found');
  }

  const eventUuid = event.eventId; // This is the UUID stored in submissions.eventIds and hiddenFromEvents

  // Find the submission
  const submission = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId) });

  if (!submission) {
    throw apiNotFound('Submission not found');
  }

  // Remove event UUID from eventId/eventIds AND add to hiddenFromEvents
  // Why: Removing from eventIds makes it invisible in event galleries
  // Why: Adding to hiddenFromEvents ensures it's excluded from event slideshows
  // BACKWARD COMPATIBILITY: Support both eventId (singular) and eventIds (array)
  // IMPORTANT: We use eventUuid (event.eventId UUID), NOT eventId (MongoDB _id)
  
  // Check if submission uses old schema (eventId) or new schema (eventIds)
  const updateOperation: any = {
    $addToSet: { hiddenFromEvents: eventUuid }, // Add event UUID to hidden list
    $set: { updatedAt: new Date().toISOString() }
  };
  
  // Remove from eventIds array if it exists, or unset eventId if it's singular
  if (submission.eventIds && Array.isArray(submission.eventIds)) {
    updateOperation.$pull = { eventIds: eventUuid }; // New schema: remove from array
  } else if (submission.eventId === eventUuid) {
    updateOperation.$unset = { eventId: '' };        // Old schema: remove singular field
  }
  
  const result = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .updateOne(
      { _id: new ObjectId(submissionId) },
      updateOperation
    );

  if (result.modifiedCount === 0) {
    throw apiBadRequest('Submission was not in this event or already removed');
  }

  // Count remaining submissions for this event (using event UUID)
  // BACKWARD COMPATIBILITY: Support both eventId (singular) and eventIds (array)
  const remainingCount = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .countDocuments({
      $and: [
        {
          $or: [
            { eventId: eventUuid },            // Old schema: singular field
            { eventIds: { $in: [eventUuid] } } // New schema: array field
          ]
        },
        { isArchived: { $ne: true } },
        {
          $or: [
            { hiddenFromEvents: { $exists: false } },
            { hiddenFromEvents: { $nin: [eventUuid] } }
          ]
        }
      ]
    });

  console.log(`✓ Removed submission ${submissionId} from event ${event.name} (${eventUuid}) by ${session.user.email}`);

  return apiSuccess({
    message: 'Submission removed from event',
    remainingSubmissions: remainingCount
  });
});
