/**
 * Event Logos API Endpoint
 * 
 * Manages logo assignments for events with scenario support
 * POST: Assign a logo to an event scenario (sets logosOverridden flag)
 * GET: List logos assigned to event (grouped by scenario)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Document, ObjectId } from 'mongodb';
import { COLLECTIONS, Event, Logo, LogoScenario, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { optionalAuth } from '@/lib/api';
import { apiSuccess, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiForbidden } from '@/lib/api/responses';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';

type EventLogoAssignment = Event['logos'][number];
type GroupedEventLogos = Record<LogoScenario, Array<EventLogoAssignment & Pick<Logo, 'name' | 'imageUrl' | 'thumbnailUrl'>>>;

function buildEventLookupQuery(eventIdentifier: string): Record<string, unknown> {
  const normalized = eventIdentifier.trim();
  const or: Array<Record<string, unknown>> = [{ eventId: normalized }];

  if (ObjectId.isValid(normalized)) {
    or.unshift({ _id: new ObjectId(normalized) });
  }

  return { $or: or };
}

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
    const validScenarios = [
      LogoScenario.SLIDESHOW_TRANSITION,
      LogoScenario.ONBOARDING_THANKYOU,
      LogoScenario.LOADING_SLIDESHOW,
      LogoScenario.LOADING_CAPTURE,
    ] as const;
    if (!validScenarios.includes(scenario)) {
      return apiBadRequest(`Invalid scenario. Must be one of: ${validScenarios.join(', ')}`);
    }

    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const logosCollection = db.collection(COLLECTIONS.LOGOS);
    const eventAccess = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
    if (!eventAccess.allowed) {
      return apiForbidden('Partner-level Events manager access is required');
    }

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
    const existingAssignment = ((event.logos ?? []) as EventLogoAssignment[]).find(
      (logoAssignment) => logoAssignment.logoId === logoId && logoAssignment.scenario === scenario
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

    // Adding a logo marks the event as having custom logo assignments
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: { logos: logoAssignment } as Document,
        $set: { 
          updatedAt: generateTimestamp(),
          logosOverridden: true, // Event now uses custom logo assignments instead of partner defaults
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
  } catch (error: unknown) {
    console.error('Error assigning logo:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to assign logo');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    
    const db = await connectToDatabase();
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const logosCollection = db.collection(COLLECTIONS.LOGOS);

    // Get event with logos
    const event = await eventsCollection.findOne(buildEventLookupQuery(eventId));
    if (!event) {
      return apiNotFound('Event');
    }

    if (!event.isActive) {
      const session = await optionalAuth(request);
      if (!session) {
        return apiNotFound('Event');
      }
      const eventMongoId = event._id.toString();
      const eventAccess = await getPartnerScopedAccessForEvent(db, eventMongoId, session, 'viewer');
      if (!eventAccess.allowed) {
        return apiForbidden('Partner-level access is required to read logos for this event');
      }
    }

    // Get full logo details for assigned logos
    const logoAssignments = (event.logos ?? []) as EventLogoAssignment[];
    const logoIds = logoAssignments.map((logoAssignment) => logoAssignment.logoId);

    const logos = await logosCollection
      .find({ logoId: { $in: logoIds } })
      .toArray();

    // Merge logo details with assignments and group by scenario
    const groupedLogos: GroupedEventLogos = {
      'slideshow-transition': [],
      'onboarding-thankyou': [],
      'loading-slideshow': [],
      'loading-capture': [],
    };

    for (const assignment of logoAssignments) {
      const logo = logos.find((item) => item.logoId === assignment.logoId);
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
    for (const scenario of Object.values(LogoScenario)) {
      groupedLogos[scenario].sort((a, b) => a.order - b.order);
    }

    return apiSuccess({
      eventId: event._id.toString(),
      eventName: event.name,
      logos: groupedLogos,
    });
  } catch (error: unknown) {
    console.error('Error fetching event logos:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch event logos');
  }
}
