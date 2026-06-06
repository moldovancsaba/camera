/**
 * Event Detail API
 * 
 * GET: Retrieve single event details with assigned frames and custom pages
 * PATCH: Update event details including customPages array
 * DELETE: Delete event with scoped partner authorization
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, CustomPageType } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import {
  withErrorHandler,
  requireAuth,
  optionalAuth,
  apiSuccess,
  apiNotFound,
  apiBadRequest,
  apiForbidden,
  validateRequiredFields,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';
import { normalizeGoShortSlugInput } from '@/lib/go-short-url';
import { normalizeEventTryOnResultSlideshowMode } from '@/lib/tryon/slideshow-policy';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
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
    submissionResultEmailSendAfterSave: notificationPolicy.sendAfterSave,
    submissionResultEmailSendAfterRelatedPhotosReady: notificationPolicy.sendAfterRelatedPhotosReady,
    submissionResultEmailSendAfterTryOnResubmissionApproved:
      notificationPolicy.sendAfterTryOnResubmissionApproved,
    termsUrl: notificationPolicy.termsUrl,
  };
}

interface EventFrameDetails {
  frameId: string;
  name?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  hashtags?: string[];
}

interface EventFrameAssignment {
  frameId: string;
  isActive?: boolean;
  frameDetails?: EventFrameDetails | null;
}

interface EventDoc {
  _id: ObjectId;
  eventId?: string;
  shortUrlSlug?: string | null;
  greatestHitsSlug?: string | null;
  isActive?: boolean;
  frames?: EventFrameAssignment[];
  [key: string]: unknown;
}

function buildEventLookupQuery(eventIdentifier: string) {
  const normalized = eventIdentifier.trim();
  const or: Array<Record<string, unknown>> = [];

  if (ObjectId.isValid(normalized)) {
    or.push({ _id: new ObjectId(normalized) });
  }

  or.push({ eventId: normalized });
  or.push({ shortUrlSlug: normalized });
  or.push({ greatestHitsSlug: normalized });

  return { $or: or };
}

/**
 * GET /api/events/[eventId]
 * Retrieve event details by MongoDB _id, event UUID, or short-url slug.
 * Public capture needs read access for active events without authentication.
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) => {
  await checkRateLimit(request, RATE_LIMITS.READ);
  const session = await optionalAuth(request);

  const { eventId } = await context.params;
  if (!eventId?.trim()) {
    throw apiBadRequest('Event identifier is required');
  }

  const db = await connectToDatabase();

  // Get event details including custom pages
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne(buildEventLookupQuery(eventId)) as EventDoc | null;

  if (!event) {
    throw apiNotFound('Event');
  }

  if (!event.isActive) {
    if (!session) {
      throw apiNotFound('Event');
    }

    const access = await getPartnerScopedAccessForEvent(db, event._id.toString(), session);
    if (!access.allowed) {
      throw apiForbidden('Partner-level access is required to read this event');
    }
  }

  // Populate frame details for assigned frames
  // This enriches event.frames[] with full frame data (name, thumbnailUrl, etc.)
  if (event.frames && event.frames.length > 0) {
    const frameIds = event.frames.map((frame) => frame.frameId);
    const frames = await db
      .collection(COLLECTIONS.FRAMES)
      .find({ frameId: { $in: frameIds } })
      .toArray() as unknown as EventFrameDetails[];
    
    // Map frame details to each assignment
    event.frames = event.frames.map((assignment) => {
      const frameDetails = frames.find((frame) => frame.frameId === assignment.frameId);
      return {
        ...assignment,
        frameDetails: frameDetails ? {
          frameId: frameDetails.frameId,
          name: frameDetails.name,
          thumbnailUrl: frameDetails.thumbnailUrl,
          width: frameDetails.width,
          height: frameDetails.height,
          hashtags: frameDetails.hashtags,
        } : null
      };
    });
  }

  // Return event with serialized _id
  // customPages is included automatically
  return apiSuccess({
    event: {
      ...event,
      _id: event._id.toString(),
    }
  });
});

/**
 * PATCH /api/events/[eventId]
 * Update event details including customPages array
 * 
 * Request body can include:
 * - name: Event name
 * - description: Event description
 * - eventDate: Event date (ISO 8601)
 * - location: Event location
 * - isActive: Active status
 * - customPages: Array of custom page configurations
 *
 * Allowed for global admins and partner-scoped Events managers
 */
export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) => {
  const session = await requireAuth(request);

  const { eventId } = await context.params;

  // Validate ObjectId format
  if (!ObjectId.isValid(eventId)) {
    throw apiBadRequest('Invalid event ID format');
  }

  const db = await connectToDatabase();
  if (!isGlobalAdminSession(session)) {
    const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
    if (!access.allowed) {
      throw apiForbidden('Partner-level manager access is required to update this event');
    }
  }

  // Check event exists
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) }) as EventDoc | null;

  if (!event) {
    throw apiNotFound('Event');
  }

  // Parse request body
  const body = await request.json();
  const {
    name,
    description,
    eventDate,
    location,
    loadingText,
    isActive,
    logoUrl,
    showLogo,
    brandColor,
    brandBorderColor,
    customPages,
    shortUrlSlug,
    greatestHitsSlug,
    tryOn,
    notifications,
    visualSettings,
    sharePage,
  } = body;

  const tryOnSetupId =
    typeof tryOn?.setupId === 'string' && tryOn.setupId.trim().length > 0
      ? tryOn.setupId.trim()
      : null;

  // Build update object with only provided fields
  const updateFields: Record<string, unknown> = {
    updatedAt: generateTimestamp(),
  };

  if (name !== undefined) {
    updateFields.name = name.trim();
  }
  if (description !== undefined) {
    updateFields.description = description.trim() || null;
  }
  if (eventDate !== undefined) {
    updateFields.eventDate = eventDate.trim() || null;
  }
  if (location !== undefined) {
    updateFields.location = location.trim() || null;
  }
  if (loadingText !== undefined) {
    updateFields.loadingText = loadingText.trim() || null;
  }
  if (logoUrl !== undefined) {
    updateFields.logoUrl = logoUrl?.trim() || null;
  }
  if (showLogo !== undefined) {
    updateFields.showLogo = Boolean(showLogo);
  }
  // Brand colors: set override flag when brand values are changed
  if (brandColor !== undefined) {
    updateFields.brandColor = brandColor?.trim() || null;
    updateFields.brandColorsOverridden = true; // Event now uses custom brand colors
  }
  if (brandBorderColor !== undefined) {
    updateFields.brandBorderColor = brandBorderColor?.trim() || null;
    updateFields.brandColorsOverridden = true; // Event now uses custom brand colors
  }
  if (isActive !== undefined) {
    updateFields.isActive = Boolean(isActive);
  }

  if (shortUrlSlug !== undefined) {
    const norm = normalizeGoShortSlugInput(shortUrlSlug);
    if (!norm.ok) {
      throw apiBadRequest(norm.error);
    }
    if (norm.slug) {
      const dup = await db.collection(COLLECTIONS.EVENTS).findOne({
        shortUrlSlug: norm.slug,
        _id: { $ne: new ObjectId(eventId) },
      });
      if (dup) {
        throw apiBadRequest('This short URL is already used by another event.');
      }
    }
    updateFields.shortUrlSlug = norm.slug;
  }

  if (greatestHitsSlug !== undefined) {
    const norm = normalizeGoShortSlugInput(greatestHitsSlug);
    if (!norm.ok) {
      throw apiBadRequest(norm.error);
    }
    if (norm.slug) {
      const dup = await db.collection(COLLECTIONS.EVENTS).findOne({
        greatestHitsSlug: norm.slug,
        _id: { $ne: new ObjectId(eventId) },
      });
      if (dup) {
        throw apiBadRequest('This Greatest Hits slug is already used by another event.');
      }
    }
    updateFields.greatestHitsSlug = norm.slug;
  }

  if (tryOn !== undefined) {
    const allowedLeatherSuitIds = Array.isArray(tryOn?.allowedLeatherSuitIds)
      ? tryOn.allowedLeatherSuitIds
          .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value: string) => value.trim())
      : [];
    const resultSlideshowMode = normalizeEventTryOnResultSlideshowMode({
      tryOn: {
        enabled: Boolean(tryOn?.enabled),
        includeApprovedResultsInSlideshows: Boolean(tryOn?.includeApprovedResultsInSlideshows),
        resultSlideshowMode: tryOn?.resultSlideshowMode,
      },
    });
    updateFields.tryOn = {
      enabled: Boolean(tryOn?.enabled),
      setupId: tryOnSetupId,
      allowedLeatherSuitIds,
      applyFrameToReturnedResults: Boolean(tryOn?.applyFrameToReturnedResults),
      vettingEnabled: tryOn?.vettingEnabled !== false,
      includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
      resultSlideshowMode,
    };
  }

  if (notifications !== undefined) {
    updateFields.notifications = normalizeEventNotificationSettings(notifications);
  }

  if (visualSettings !== undefined) {
    updateFields.visualSettings = normalizeEventVisualSettings(visualSettings);
  }

  if (sharePage !== undefined) {
    updateFields.sharePage = normalizeEventSharePageSettings(sharePage);
  }

  // Handle customPages array
  // Validates page structure and ensures proper ordering
  if (customPages !== undefined) {
    if (!Array.isArray(customPages)) {
      throw apiBadRequest('customPages must be an array');
    }

    // Validate each page
    for (const page of customPages) {
      // Required fields
      validateRequiredFields(page, ['pageId', 'pageType', 'order', 'isActive', 'config']);

      // Mongo / JSON may deserialize `order` as string — capture flow only accepts numbers
      if (typeof page.order !== 'number') {
        const n = Number(page.order);
        if (!Number.isFinite(n)) {
          throw apiBadRequest('page.order must be a number');
        }
        page.order = n;
      }

      // Validate pageType first
      const validTypes = Object.values(CustomPageType);
      if (!validTypes.includes(page.pageType)) {
        throw apiBadRequest(`Invalid pageType: ${page.pageType}. Must be one of: ${validTypes.join(', ')}`);
      }

      // Non–take-photo: title + primary button required; description is optional in the admin UI
      if (page.pageType !== 'take-photo') {
        validateRequiredFields(page.config, ['title', 'buttonText']);
      } else {
        // take-photo only needs config object to exist
        if (!page.config || typeof page.config !== 'object') {
          throw apiBadRequest('take-photo pages must have config object');
        }
      }

      // Validate type-specific config
      if (page.pageType === 'who-are-you') {
        // who-are-you pages should have nameLabel and emailLabel
        if (!page.config.nameLabel || !page.config.emailLabel) {
          throw apiBadRequest('who-are-you pages must have nameLabel and emailLabel in config');
        }
      }

      if (page.pageType === 'accept') {
        // accept pages must have checkboxText
        if (!page.config.checkboxText) {
          throw apiBadRequest('accept pages must have checkboxText in config');
        }
      }
      
      // CTA pages: checkboxText is optional (used as URL to visit)
      // No validation needed as it's an optional field

      // Ensure timestamps exist
      if (!page.createdAt) {
        page.createdAt = generateTimestamp();
      }
      page.updatedAt = generateTimestamp();
    }

    updateFields.customPages = customPages;
  }

  // Update event in database
  const result = await db
    .collection(COLLECTIONS.EVENTS)
    .updateOne(
      { _id: new ObjectId(eventId) },
      { $set: updateFields }
    );

  if (result.matchedCount === 0) {
    throw apiNotFound('Event');
  }

  // Fetch updated event
  const updatedEvent = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) });

  return apiSuccess({
    event: {
      ...updatedEvent,
      _id: updatedEvent!._id.toString(),
    }
  });
});

/**
 * DELETE /api/events/[eventId]
 * Delete an event
 * 
 * Admin only
 */
export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) => {
  const session = await requireAuth(request);

  const { eventId } = await context.params;

  // Validate ObjectId format
  if (!ObjectId.isValid(eventId)) {
    throw apiBadRequest('Invalid event ID format');
  }

  const db = await connectToDatabase();
  if (!isGlobalAdminSession(session)) {
    const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'admin');
    if (!access.allowed) {
      throw apiForbidden('Partner-level admin access is required to delete this event');
    }
  }

  // Check event exists
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) });

  if (!event) {
    throw apiNotFound('Event');
  }

  // Delete the event
  await db
    .collection(COLLECTIONS.EVENTS)
    .deleteOne({ _id: new ObjectId(eventId) });

  return apiSuccess({
    message: 'Event deleted successfully',
    eventId,
  });
});
