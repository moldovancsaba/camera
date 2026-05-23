/**
 * Event Frame Toggle API Endpoint
 * 
 * PATCH: Toggle frame active/inactive status for an event
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS, Event, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiForbidden } from '@/lib/api/responses';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';

type EventFrameAssignment = Event['frames'][number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; frameId: string }> }
) {
  try {
    // Authentication check
    const session = await getSession();
    if (!session) {
      return apiUnauthorized('Authentication required');
    }

    const { eventId, frameId } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(eventId)) {
      return apiBadRequest('Invalid event ID format');
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const eventAccess = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
    if (!eventAccess.allowed) {
      return apiForbidden('Partner-level Events manager access is required');
    }

    // Get event (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Find frame assignment
    const frameAssignments = (event.frames ?? []) as EventFrameAssignment[];
    const frameIndex = frameAssignments.findIndex((frame) => frame.frameId === frameId);

    if (frameIndex === -1) {
      return apiNotFound('Frame assignment');
    }

    // Toggle isActive status
    const currentStatus = frameAssignments[frameIndex].isActive;
    const newStatus = !currentStatus;

    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId), 'frames.frameId': frameId },
      {
        $set: {
          'frames.$.isActive': newStatus,
          updatedAt: generateTimestamp(),
        },
      }
    );

    return apiSuccess({
      message: `Frame ${newStatus ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus,
    });
  } catch (error: unknown) {
    console.error('Error toggling frame:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to toggle frame');
  }
}
