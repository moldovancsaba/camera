/**
 * Event Frames API Endpoint
 * 
 * Manages frame assignments for events
 * POST: Assign a frame to an event (sets framesOverridden flag)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Document, ObjectId } from 'mongodb';
import { COLLECTIONS, Event, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiForbidden } from '@/lib/api/responses';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { checkEventAssign } from '@/lib/library/db';
import { withErrorHandler } from '@/lib/api/withErrorHandler';

type EventFrameAssignment = Event['frames'][number];

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) => {
  try {
    // Authentication check
    const session = await getSession();
    if (!session) {
      return apiUnauthorized('Authentication required');
    }

    const { eventId } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(eventId)) {
      return apiBadRequest('Invalid event ID format');
    }
    
    const body = await request.json();
    const { frameId, isActive = true } = body;

    if (!frameId) {
      return apiBadRequest('frameId is required');
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const eventAccess = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
    if (!eventAccess.allowed) {
      return apiForbidden('Partner-level Events manager access is required');
    }

    // Verify event exists (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // One way only (camera#361): an event takes a frame from its partner's library, or its own upload, never straight from the global library.
    const allowed = await checkEventAssign(db, event, 'frames', frameId);
    if (!allowed.ok) {
      return allowed.status === 404 ? apiNotFound('Frame') : apiBadRequest(allowed.reason);
    }

    // Check if frame is already assigned
    const existingAssignment = ((event.frames ?? []) as EventFrameAssignment[]).find(
      (frame) => frame.frameId === frameId
    );

    if (existingAssignment) {
      return apiBadRequest('Frame is already assigned to this event');
    }

    // Add frame assignment
    const frameAssignment = {
      frameId: frameId,
      isActive,
      addedAt: generateTimestamp(),
      addedBy: session.user.id, // SSO User interface uses 'id' not 'userId'
    };

    // Adding a frame marks the event as having custom frame assignments
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: { frames: frameAssignment } as Document,
        $set: { 
          updatedAt: generateTimestamp(),
          framesOverridden: true, // Event now uses custom frame assignments instead of partner defaults
        },
      }
    );

    return apiSuccess({
      message: 'Frame assigned successfully',
      frameAssignment,
    });
  } catch (error: unknown) {
    console.error('Error assigning frame:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to assign frame');
  }
});
