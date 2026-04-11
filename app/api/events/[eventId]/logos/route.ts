/**
 * Event Logos API Endpoint
 * 
 * Manages logo assignments for events with scenario support
 * POST: Assign a logo to an event scenario (sets logosOverridden flag)
 * GET: List logos assigned to event (grouped by scenario)
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
    const { logoId, scenario, order = 0, isActive = true } = body;

    if (!logoId) {
      return apiBadRequest('logoId is required');
    }

    if (!scenario) {
      return apiBadRequest('scenario is required');
    }

    // Validate scenario
    const validScenarios = ['slideshow-transition', 'onboarding-thankyou', 'loading-slideshow', 'loading-capture'];
    if (!validScenarios.includes(scenario)) {
      return apiBadRequest(`Invalid scenario. Must be one of: ${validScenarios.join(', ')}`);
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const logosCollection = db.collection(COLLECTIONS.LOGOS);

    // Verify event exists (using MongoDB _id)
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    // Verify logo exists (use logoId UUID)
    const logo = await logosCollection.findOne({ logoId });
    if (!logo) {
      return apiNotFound('Logo');
    }

    // Check if logo is already assigned to this scenario
    const existingAssignment = (event.logos || []).find(
      (l: any) => l.logoId === logoId && l.scenario === scenario
    );

    if (existingAssignment) {
      return apiBadRequest('Logo is already assigned to this event scenario');
    }

    // Add logo assignment
    const logoAssignment = {
      logoId: logoId,
      scenario,
      order,
      isActive,
      addedAt: generateTimestamp(),
      addedBy: session.user.id,
    };

    // Adding a logo marks event as having custom logo assignments (v2.8.0)
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: { logos: logoAssignment } as any,
        $set: { 
          updatedAt: generateTimestamp(),
          logosOverridden: true, // Mark as orphan - independent of partner defaults
        },
      }
    );

    // Update logo usage count
    await logosCollection.updateOne(
      { logoId },
      {
        $inc: { usageCount: 1 },
        $set: { lastUsedAt: generateTimestamp() },
      }
    );

    return apiSuccess({
      message: 'Logo assigned successfully',
      logoAssignment,
    });
  } catch (error: any) {
    console.error('Error assigning logo:', error);
    return apiError(error.message);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(eventId)) {
      return apiBadRequest('Invalid event ID format');
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const logosCollection = db.collection(COLLECTIONS.LOGOS);

    // Get event with logos
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return apiNotFound('Event');
    }

    console.log('Event logos array:', event.logos);

    // Get full logo details for assigned logos
    const logoAssignments = event.logos || [];
    console.log('Logo assignments:', logoAssignments);
    const logoIds = logoAssignments.map((l: any) => l.logoId);
    console.log('Logo IDs to fetch:', logoIds);

    const logos = await logosCollection
      .find({ logoId: { $in: logoIds } })
      .toArray();
    
    console.log('Found logos from collection:', logos.length);
    console.log('Logos:', logos.map((l: any) => ({ logoId: l.logoId, name: l.name })));

    // Merge logo details with assignments and group by scenario
    const groupedLogos: Record<string, any[]> = {
      'slideshow-transition': [],
      'onboarding-thankyou': [],
      'loading-slideshow': [],
      'loading-capture': [],
    };

    for (const assignment of logoAssignments) {
      const logo = logos.find((l: any) => l.logoId === assignment.logoId);
      if (logo) {
        groupedLogos[assignment.scenario].push({
          ...assignment,
          name: logo.name,
          imageUrl: logo.imageUrl,
          thumbnailUrl: logo.thumbnailUrl,
        });
      }
    }

    // Sort each scenario by order
    for (const scenario in groupedLogos) {
      groupedLogos[scenario].sort((a, b) => a.order - b.order);
    }

    console.log('Grouped logos result:', JSON.stringify(groupedLogos, null, 2));

    return apiSuccess({
      eventId: event._id.toString(),
      eventName: event.name,
      logos: groupedLogos,
    });
  } catch (error: any) {
    console.error('Error fetching event logos:', error);
    return apiError(error.message);
  }
}
