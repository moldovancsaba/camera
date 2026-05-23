/**
 * Event Logo Management API Endpoint
 * 
 * DELETE: Remove logo from event
 * PATCH: Toggle logo active status or update order
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Document, ObjectId } from 'mongodb';
import { COLLECTIONS, Event, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiForbidden } from '@/lib/api/responses';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';

type EventLogoAssignment = Event['logos'][number];

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; logoId: string }> }
) {
  try {
    // Authentication check
    const session = await getSession();
    if (!session) {
      return apiUnauthorized('Authentication required');
    }

    const { eventId, logoId } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(eventId)) {
      return apiBadRequest('Invalid event ID format');
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const logosCollection = db.collection(COLLECTIONS.LOGOS);
    const eventAccess = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
    if (!eventAccess.allowed) {
      return apiForbidden('Partner-level Events manager access is required');
    }

    // Get event (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Find logo assignment
    const logoAssignment = ((event.logos ?? []) as EventLogoAssignment[]).find(
      (logo) => logo.logoId === logoId
    );

    if (!logoAssignment) {
      return apiNotFound('Logo assignment');
    }

    // Remove logo from event
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $pull: { logos: { logoId } } as Document,
        $set: { updatedAt: generateTimestamp() },
      }
    );

    // Decrement logo usage count
    await logosCollection.updateOne(
      { logoId },
      { $inc: { usageCount: -1 } }
    );

    return apiSuccess({
      message: 'Logo removed successfully',
    });
  } catch (error: unknown) {
    console.error('Error removing logo:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to remove logo');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; logoId: string }> }
) {
  try {
    // Authentication check
    const session = await getSession();
    if (!session) {
      return apiUnauthorized('Authentication required');
    }

    const { eventId, logoId } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(eventId)) {
      return apiBadRequest('Invalid event ID format');
    }

    const body = await request.json();
    const { action, order } = body;

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

    // Find logo assignment index
    const logoAssignments = (event.logos ?? []) as EventLogoAssignment[];
    const logoIndex = logoAssignments.findIndex((logo) => logo.logoId === logoId);

    if (logoIndex === -1) {
      return apiNotFound('Logo assignment');
    }

    // Handle different actions
    if (action === 'toggle') {
      // Toggle isActive status
      const currentStatus = logoAssignments[logoIndex].isActive;
      const newStatus = !currentStatus;

      await eventsCollection.updateOne(
        { _id: new ObjectId(eventId), 'logos.logoId': logoId },
        {
          $set: {
            'logos.$.isActive': newStatus,
            updatedAt: generateTimestamp(),
          },
        }
      );

      return apiSuccess({
        message: `Logo ${newStatus ? 'activated' : 'deactivated'} successfully`,
        isActive: newStatus,
      });
    } else if (action === 'updateOrder' && typeof order === 'number') {
      // Update order
      await eventsCollection.updateOne(
        { _id: new ObjectId(eventId), 'logos.logoId': logoId },
        {
          $set: {
            'logos.$.order': order,
            updatedAt: generateTimestamp(),
          },
        }
      );

      return apiSuccess({
        message: 'Logo order updated successfully',
        order,
      });
    } else {
      return apiBadRequest('Invalid action or missing order parameter');
    }
  } catch (error: unknown) {
    console.error('Error updating logo:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to update logo');
  }
}
