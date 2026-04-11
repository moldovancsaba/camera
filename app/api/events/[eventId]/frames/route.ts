/**
 * Event Frames API Endpoint
 * 
 * Manages frame assignments for events
 * POST: Assign a frame to an event (sets framesOverridden flag)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError } from '@/lib/api/responses';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
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
    const framesCollection = db.collection(COLLECTIONS.FRAMES);

    // Verify event exists (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Verify frame exists (use frameId UUID)
    const frame = await framesCollection.findOne({ frameId });
    if (!frame) {
      return apiNotFound('Frame');
    }

    // Check if frame is already assigned
    const existingAssignment = (event.frames || []).find(
      (f: any) => f.frameId === frameId
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

    // Adding a frame marks event as having custom frame assignments (v2.8.0)
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: { frames: frameAssignment } as any,
        $set: { 
          updatedAt: generateTimestamp(),
          framesOverridden: true, // Mark as orphan - independent of partner defaults
        },
      }
    );

    return apiSuccess({
      message: 'Frame assigned successfully',
      frameAssignment,
    });
  } catch (error: any) {
    console.error('Error assigning frame:', error);
    return apiError(error.message);
  }
}
