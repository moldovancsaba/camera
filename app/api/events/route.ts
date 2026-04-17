/**
 * Events API - List and Create
 * 
 * GET: List all events with pagination, search, and partner filtering
 * POST: Create new event (admin only, requires partnerId, inherits partner defaults)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { inheritPartnerDefaults } from '@/lib/db/events';
import { normalizeGoShortSlugInput } from '@/lib/go-short-url';
import {
  withErrorHandler,
  requireAdmin,
  parsePaginationParams,
  validateRequiredFields,
  apiSuccess,
  apiCreated,
  apiNotFound,
  apiBadRequest,
} from '@/lib/api';

/**
 * GET /api/events
 * List all events with optional pagination, search, and filtering
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search by event name
 * - partnerId: Filter by partner
 * - active: Filter by active status (true/false)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);
  const search = searchParams.get('search');
  const partnerId = searchParams.get('partnerId');
  const active = searchParams.get('active');

  const db = await connectToDatabase();
    
    // Build query
    // Query filters narrow down events based on partner, name, or status
    const query: any = {};
    
    // Filter by partner
    if (partnerId) {
      query.partnerId = partnerId;
    }
    
    // Search by event name (case-insensitive)
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    // Filter by active status
    if (active !== null) {
      query.isActive = active === 'true';
    }

    // Get total count for pagination
    const total = await db.collection(COLLECTIONS.EVENTS).countDocuments(query);

    // Get paginated results sorted by event date (newest first) then creation date
    const events = await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

  return apiSuccess({
    events,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/events
 * Create a new event (admin only)
 * 
 * Required fields in request body:
 * - name: Event name
 * - partnerId: Partner UUID
 * 
 * Optional fields:
 * - description: Event description
 * - eventDate: Event date (ISO 8601)
 * - location: Event location
 * - isActive: Active status (default: true)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Check authentication and authorization - only admin users can create events
  const session = await requireAdmin();

  // Parse request body
  const body = await request.json();
  const { name, partnerId, description, eventDate, location, isActive, logoUrl, showLogo, shortUrlSlug } =
    body;

  // Validate required fields
  validateRequiredFields(body, ['name', 'partnerId']);

  const db = await connectToDatabase();

  // Verify partner exists and get partner name
  // This ensures referential integrity and caches partner name for display
  const partner = await db
    .collection(COLLECTIONS.PARTNERS)
    .findOne({ partnerId: partnerId.trim() });

  if (!partner) {
    throw apiNotFound('Partner');
  }

  // Inherit partner defaults (v2.8.0)
  // New events automatically get partner's default styles (brand colors, frames, logos)
  // Override flags are set to false (child behavior)
  const inheritedDefaults = await inheritPartnerDefaults(partner.partnerId);

  let resolvedShortSlug: string | null | undefined;
  if (shortUrlSlug !== undefined && shortUrlSlug !== null) {
    const norm = normalizeGoShortSlugInput(shortUrlSlug);
    if (!norm.ok) {
      throw apiBadRequest(norm.error);
    }
    if (norm.slug) {
      const dup = await db.collection(COLLECTIONS.EVENTS).findOne({ shortUrlSlug: norm.slug });
      if (dup) {
        throw apiBadRequest('This short URL is already used by another event.');
      }
      resolvedShortSlug = norm.slug;
    } else {
      resolvedShortSlug = null;
    }
  }

  // Create event document
  // eventId is a UUID for consistent identification
  // partnerName is cached for efficient queries and display
  // frames/logos inherited from partner defaults (v2.8.0)
  // customPages array starts empty - pages can be added via PATCH (v2.0.0)
  const now = generateTimestamp();
  const event = {
    eventId: generateId(),
    name: name.trim(),
    description: description?.trim() || undefined,
    partnerId: partner.partnerId,
    partnerName: partner.name,
    eventDate: eventDate?.trim() || undefined,
    location: location?.trim() || undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    logoUrl: logoUrl?.trim() || undefined,
    showLogo: Boolean(showLogo),
    // Inherited defaults from partner (v2.8.0)
    brandColor: inheritedDefaults.brandColor,
    brandBorderColor: inheritedDefaults.brandBorderColor,
    brandColorsOverridden: inheritedDefaults.brandColorsOverridden,
    frames: inheritedDefaults.frames,
    framesOverridden: inheritedDefaults.framesOverridden,
    logos: inheritedDefaults.logos || [],
    logosOverridden: inheritedDefaults.logosOverridden,
    customPages: [],  // v2.0.0: Empty array = default flow (straight to photo capture)
    ...(resolvedShortSlug !== undefined ? { shortUrlSlug: resolvedShortSlug } : {}),
    submissionCount: 0,
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.EVENTS).insertOne(event);

  return apiCreated({
    event: {
      _id: result.insertedId,
      ...event,
    },
  });
});
