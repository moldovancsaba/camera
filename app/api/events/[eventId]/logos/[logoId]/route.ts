/**
 * Event Logo Management API Endpoint
 * 
 * DELETE: Remove logo from event
 * PATCH: Toggle logo active status or update order
 *
 * A logo can be assigned to several scenarios of one event (the defaults give most events the same logo in all four). With `scenario`
 * (`?scenario=` on DELETE, in the body on PATCH) only that scenario's assignment changes; without it, as before, DELETE removes the logo from
 * every scenario and PATCH changes its first assignment. Every change marks the event's list as its own (`logosOverridden`), so a later change
 * of the partner's defaults no longer replaces it (camera#367).
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Document, ObjectId } from 'mongodb';
import { COLLECTIONS, Event, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiForbidden } from '@/lib/api/responses';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { LOGO_SCENARIOS, isLogoScenario } from '@/lib/library/logos';

type EventLogoAssignment = Event['logos'][number];

const SCENARIO_ERROR = `Invalid scenario. Must be one of: ${LOGO_SCENARIOS.map((scenario) => scenario.id).join(', ')}`;

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

    const scenario = request.nextUrl.searchParams.get('scenario');
    if (scenario !== null && !isLogoScenario(scenario)) {
      return apiBadRequest(SCENARIO_ERROR);
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

    // Find logo assignment (in the scenario, when one is given)
    const logoAssignment = ((event.logos ?? []) as EventLogoAssignment[]).find(
      (logo) => logo.logoId === logoId && (scenario === null || logo.scenario === scenario)
    );

    if (!logoAssignment) {
      return apiNotFound('Logo assignment');
    }

    // Remove logo from event; the event's list is now its own
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $pull: { logos: scenario === null ? { logoId } : { logoId, scenario } } as Document,
        $set: { updatedAt: generateTimestamp(), logosOverridden: true },
      }
    );

    // Decrement logo usage count (never below zero: uploads, imports and the defaults cascade do not count themselves in)
    const counted = await logosCollection.findOne({ logoId });
    if (typeof counted?.usageCount === 'number' && counted.usageCount > 0) {
      await logosCollection.updateOne({ logoId }, { $inc: { usageCount: -1 } });
    }

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
    const scenario: unknown = body.scenario ?? null;
    if (scenario !== null && !isLogoScenario(scenario)) {
      return apiBadRequest(SCENARIO_ERROR);
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

    // Find logo assignment index (in the scenario, when one is given)
    const logoAssignments = (event.logos ?? []) as EventLogoAssignment[];
    const logoIndex = logoAssignments.findIndex((logo) => logo.logoId === logoId && (scenario === null || logo.scenario === scenario));

    if (logoIndex === -1) {
      return apiNotFound('Logo assignment');
    }

    // The positional `$` stands for the first assignment that matches: of the logo, or of the logo in the scenario.
    const target = scenario === null
      ? { _id: new ObjectId(eventId), 'logos.logoId': logoId }
      : { _id: new ObjectId(eventId), logos: { $elemMatch: { logoId, scenario } } };

    // Handle different actions
    if (action === 'toggle') {
      // Toggle isActive status
      const currentStatus = logoAssignments[logoIndex].isActive;
      const newStatus = !currentStatus;

      await eventsCollection.updateOne(
        target,
        {
          $set: {
            'logos.$.isActive': newStatus,
            updatedAt: generateTimestamp(),
            logosOverridden: true,
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
        target,
        {
          $set: {
            'logos.$.order': order,
            updatedAt: generateTimestamp(),
            logosOverridden: true,
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
