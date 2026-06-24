/**
 * Events API - List and Create
 * 
 * GET: List all events with pagination, search, and partner filtering
 * POST: Create new event (global admin or partner-scoped Events manager, requires partnerId)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { inheritPartnerDefaults } from '@/lib/db/events';
import { normalizeGoShortSlugInput } from '@/lib/go-short-url';
import {
  withErrorHandler,
  requireAuth,
  parsePaginationParams,
  validateRequiredFields,
  apiSuccess,
  apiCreated,
  apiNotFound,
  apiBadRequest,
  apiForbidden,
} from '@/lib/api';
import {
  getPartnerScopedAccessForPartner,
  isGlobalAdminSession,
  listAccessiblePartnerIds,
} from '@/lib/partners/authorization';
import { normalizeEventTryOnResultSlideshowMode } from '@/lib/tryon/slideshow-policy';
import { normalizeEventVisualSettings } from '@/lib/events/visual-settings';
import { normalizeEventSharePageSettings } from '@/lib/events/share-page-settings';
import { normalizeSubmissionEmailPolicy } from '@/lib/email/submission-result-email';

function normalizeEventNotificationSettings(value: unknown) {
  const notificationPolicy = normalizeSubmissionEmailPolicy(value);
  return {
    submissionResultEmailEnabled: notificationPolicy.enabled,
    submissionResultEmailSubject: notificationPolicy.subjectTemplate || null,
    submissionResultEmailBody: notificationPolicy.bodyTemplate || null,
    submissionResultEmailSubjectAfterSave: notificationPolicy.subjectTemplateAfterSave || null,
    submissionResultEmailBodyAfterSave: notificationPolicy.bodyTemplateAfterSave || null,
    submissionResultEmailSubjectAfterRelatedPhotosReady:
      notificationPolicy.subjectTemplateAfterRelatedPhotosReady || null,
    submissionResultEmailBodyAfterRelatedPhotosReady:
      notificationPolicy.bodyTemplateAfterRelatedPhotosReady || null,
    submissionResultEmailSubjectAfterTryOnResubmissionApproved:
      notificationPolicy.subjectTemplateAfterTryOnResubmissionApproved || null,
    submissionResultEmailBodyAfterTryOnResubmissionApproved:
      notificationPolicy.bodyTemplateAfterTryOnResubmissionApproved || null,
    submissionResultEmailSenderName: notificationPolicy.senderName,
    submissionResultEmailSendAfterSave: notificationPolicy.sendAfterSave,
    submissionResultEmailSendAfterRelatedPhotosReady: notificationPolicy.sendAfterRelatedPhotosReady,
    submissionResultEmailSendAfterTryOnResubmissionApproved:
      notificationPolicy.sendAfterTryOnResubmissionApproved,
    termsUrl: notificationPolicy.termsUrl,
  };
}

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
  const session = await requireAuth(request);
  const accessiblePartnerIds = await listAccessiblePartnerIds(db, session, 'events');
    
    // Build query
    // Query filters narrow down events based on partner, name, or status
    const query: Record<string, unknown> = {};
    if (!isGlobalAdminSession(session)) {
      query.partnerId = { $in: accessiblePartnerIds };
    }
    
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
 * Create a new event within the caller's allowed partner scope
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
  const session = await requireAuth(request);

  // Parse request body
  const body = await request.json();
  const { name, partnerId, description, eventDate, location, isActive, logoUrl, showLogo, shortUrlSlug, greatestHitsSlug, tryOn, notifications, visualSettings, sharePage } =
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
  if (!isGlobalAdminSession(session)) {
    const access = await getPartnerScopedAccessForPartner(db, session, partner.partnerId, 'events', 'manager');
    if (!access.allowed) {
      throw apiForbidden('Partner-level manager access is required to create events for this partner');
    }
  }

  // Inherit partner defaults for brand colors, frames, and logos.
  // Override flags stay false until the event is customized explicitly.
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

  let resolvedGreatestHitsSlug: string | null | undefined;
  if (greatestHitsSlug !== undefined && greatestHitsSlug !== null) {
    const norm = normalizeGoShortSlugInput(greatestHitsSlug);
    if (!norm.ok) {
      throw apiBadRequest(norm.error);
    }
    if (norm.slug) {
      const dup = await db.collection(COLLECTIONS.EVENTS).findOne({ greatestHitsSlug: norm.slug });
      if (dup) {
        throw apiBadRequest('This Greatest Hits slug is already used by another event.');
      }
      resolvedGreatestHitsSlug = norm.slug;
    } else {
      resolvedGreatestHitsSlug = null;
    }
  }

  // Create event document
  // eventId is a UUID for consistent identification
  // partnerName is cached for efficient queries and display
  // frames/logos inherit from partner defaults
  // customPages starts empty; pages can be added later via PATCH
  const now = generateTimestamp();
  const resultSlideshowMode = normalizeEventTryOnResultSlideshowMode({
    tryOn: {
      enabled: Boolean(tryOn?.enabled),
      includeApprovedResultsInSlideshows: Boolean(tryOn?.includeApprovedResultsInSlideshows),
      resultSlideshowMode: tryOn?.resultSlideshowMode,
    },
  });
  const tryOnSetupId =
    typeof tryOn?.setupId === 'string' && tryOn.setupId.trim().length > 0
      ? tryOn.setupId.trim()
      : null;
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
    // Inherited defaults from partner
    brandColor: inheritedDefaults.brandColor,
    brandBorderColor: inheritedDefaults.brandBorderColor,
    visualSettings: normalizeEventVisualSettings(visualSettings),
    sharePage: normalizeEventSharePageSettings(sharePage),
    brandColorsOverridden: inheritedDefaults.brandColorsOverridden,
    frames: inheritedDefaults.frames,
    framesOverridden: inheritedDefaults.framesOverridden,
    logos: inheritedDefaults.logos || [],
    logosOverridden: inheritedDefaults.logosOverridden,
    customPages: [],
    tryOn: {
      enabled: Boolean(tryOn?.enabled),
      setupId: tryOnSetupId,
      allowedLeatherSuitIds: Array.isArray(tryOn?.allowedLeatherSuitIds)
        ? tryOn.allowedLeatherSuitIds
            .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
            .map((value: string) => value.trim())
        : [],
      applyFrameToReturnedResults: Boolean(tryOn?.applyFrameToReturnedResults),
      vettingEnabled: tryOn?.vettingEnabled !== false,
      localAiQualityGateEnabled: Boolean(tryOn?.localAiQualityGateEnabled),
      includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
      resultSlideshowMode,
    },
    notifications: normalizeEventNotificationSettings(notifications),
    ...(resolvedShortSlug !== undefined ? { shortUrlSlug: resolvedShortSlug } : {}),
    ...(resolvedGreatestHitsSlug !== undefined ? { greatestHitsSlug: resolvedGreatestHitsSlug } : {}),
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
