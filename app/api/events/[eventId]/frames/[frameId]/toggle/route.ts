/**
 * Event Frame Toggle API Endpoint
 * 
 * PATCH: Toggle frame active/inactive status for an event
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError } from '@/lib/api/responses';

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

    // Get event (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Find frame assignment
    const frameIndex = (event.frames || []).findIndex(
      (f: any) => f.frameId === frameId
    );

    if (frameIndex === -1) {
      return apiNotFound('Frame assignment');
    }

    // Toggle isActive status
    const currentStatus = event.frames[frameIndex].isActive;
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
  } catch (error: any) {
    console.error('Error toggling frame:', error);
    return apiError(error.message);
  }
}
