/**
 * Event Frame Management API Endpoint
 * 
 * DELETE: Remove a frame from an event
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError } from '@/lib/api/responses';

export async function DELETE(
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

    // Verify event exists (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Remove frame assignment
    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $pull: { frames: { frameId } } as any,
        $set: { updatedAt: generateTimestamp() },
      }
    );

    if (result.modifiedCount === 0) {
      return apiNotFound('Frame assignment');
    }

    return apiSuccess({
      message: 'Frame removed successfully',
    });
  } catch (error: any) {
    console.error('Error removing frame:', error);
    return apiError(error.message);
  }
}
