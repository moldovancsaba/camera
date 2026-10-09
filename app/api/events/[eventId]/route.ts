/**
 * Event Detail API
 * 
 * GET: Retrieve single event details with assigned frames and custom pages
 * PATCH: Update event details including customPages array
 * DELETE: Delete event with scoped partner authorization
 */

import { NextRequest, after } from 'next/server';
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
import { isUiLanguage, UI_LANGUAGES } from '@/lib/i18n';
import { normalizeSubmissionEmailPolicy } from '@/lib/email/submission-result-email';
import { captureFrameOf } from '@/lib/frame/capture';
import { normalizePhotoVettingInput, photoVettingRequired } from '@/lib/events/photo-vetting';
import { applyEventBrandColours } from '@/lib/events/brand-colours';
import { parseMessageArea } from '@/lib/frame/message-area';
import { withDefaultJourneyPages } from '@/lib/events/default-pages';
import { loadEventTexts } from '@/lib/i18n/overrides';
import { storedPartnerPictures, withPartnerPictures } from '@/lib/events/partner-pictures';
import { sanitizeCheckboxes } from '@/lib/events/consent';
import { eventGetsDefaults, getDefaultsRollout } from '@/lib/admin/defaults-rollout';
import { loadEventTheme } from '@/lib/theme/load';
import { needsThemeRefresh, refreshEventTheme } from '@/lib/theme/refresh';
import { trackedSlugExists } from '@/lib/short-links/store';

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

interface EventFrameDetails {
  frameId: string;
  name?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  hashtags?: string[];
  /** The library item's own switch and age: the capture page offers active frames, newest first (camera#361). */
  isActive?: boolean;
  createdAt?: string;
  /** What the library item stores; only whether it has a usable one leaves this route (`hasMessageArea`). */
  messageArea?: unknown;
  /** The frame carries the messages of an event (camera#366): it is not a complete frame the guest picks. */
  hasMessageArea?: boolean;
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
          imageUrl: frameDetails.imageUrl,
          width: frameDetails.width,
          height: frameDetails.height,
          hashtags: frameDetails.hashtags,
          isActive: frameDetails.isActive,
          createdAt: frameDetails.createdAt,
          hasMessageArea: parseMessageArea(frameDetails.messageArea) !== null,
        } : null
      };
    });
  }

  // The generated default frame reaches the capture page as `generatedFrame`, derived: present only while the event
  // has no active frame of its own (camera#236). The stored `frameDesign` (snapshot of messmass data, message list,
  // render internals) is admin data and is not part of this public response; admins read it from .../frame-design.
  // `photoVetting` (who changed it, when) is admin data: guests get `photoVettingRequired`, and when asked as a guest
  // (`?audience=guest`, the capture page) a vetted event with no "who are you" page before the photo gets the default one first:
  // every vetted event asks for an email or a social login (camera#264). The admin editor reads the stored pages, never this one.
  const { frameDesign, photoVetting, ...publicEvent } = event;
  const vettingRequired = photoVettingRequired({ photoVetting: photoVetting as { required?: unknown } | undefined });
  const forGuest = request.nextUrl.searchParams.get('audience') === 'guest';

  // The look of the guest pages (camera#285): the messmass style snapshot of the event, or for an event without one camera's own
  // name and partner logo with the system default look. A snapshot that is stale (messmass said something changed) or older than a
  // day is refreshed after this response, so the next guest sees the new theme without waiting for it.
  if (event.isActive && needsThemeRefresh(event as unknown as Record<string, unknown>)) {
    after(async () => {
      await refreshEventTheme(db, event as unknown as Record<string, unknown>);
    });
  }

  // The default consent page comes with the journey defaults: an event created with them, or any event once the global switch is on (camera#330).
  // The page editor asks too (camera#378): it shows the journey from the same function, so it needs to know which defaults the event gets.
  const consentDefault = eventGetsDefaults(event as { journeyDefaults?: unknown }, await getDefaultsRollout(db));
  // The default welcome page needs the picture drawn from the event's default slideshow (issue 327): an event without it gets none.
  const hasWelcomeScreen = typeof (event as { welcomeScreen?: { url?: unknown } }).welcomeScreen?.url === 'string';
  // The wordings an admin wrote for the event's partner or for the event, in its language: the default pages use them (lib/i18n/overrides.ts, issue 353). None written: an empty object.
  // The language is the event's own, or its partner's when the event has none (the partner's default language).
  const { overrides: texts, language, partner } = await loadEventTexts(db, event as unknown as Record<string, unknown>);
  // A picture field a page left empty shows the partner's default picture, at read time and never stored (lib/events/partner-pictures.ts, issue 368).
  const partnerPictures = storedPartnerPictures(partner?.pictures);

  // Return event with serialized _id
  // customPages is included automatically
  return apiSuccess({
    event: {
      ...publicEvent,
      theme: await loadEventTheme(db, event as unknown as Record<string, unknown>),
      ...(forGuest ? { customPages: withPartnerPictures(withDefaultJourneyPages(event.customPages as Parameters<typeof withDefaultJourneyPages>[0], { vettingRequired, consentDefault, language, hasWelcomeScreen, texts }), partnerPictures) } : {}),
      photoVettingRequired: vettingRequired,
      // What decides which default pages this event gets (lib/events/journey.ts): the page editor builds the journey from it.
      journeyContext: { vettingRequired, consentDefault, language, hasWelcomeScreen, texts },
      _id: event._id.toString(),
      generatedFrame: captureFrameOf({ frames: event.frames, frameDesign: frameDesign as Parameters<typeof captureFrameOf>[0]['frameDesign'] }),
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
    emailFooterImageUrl,
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
    photoVetting,
    uiLanguage,
    frameChoice,
    tourEnabled,
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
  if (emailFooterImageUrl !== undefined) {
    const footer = typeof emailFooterImageUrl === 'string' ? emailFooterImageUrl.trim() : '';
    if (footer && !/^https:\/\/[^\s]+$/.test(footer)) {
      throw apiBadRequest('emailFooterImageUrl must be an https address');
    }
    updateFields.emailFooterImageUrl = footer || null;
  }
  if (showLogo !== undefined) {
    updateFields.showLogo = Boolean(showLogo);
  }
  // Brand colors (camera#380): by default they come from messmass, so a colour is stored only when it is submitted, and a save that does not send them leaves them
  // alone. Empty or null clears a colour; with both cleared the event takes the default of its partner, else it follows messmass again.
  if (brandColor !== undefined || brandBorderColor !== undefined) {
    const partnerRow = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }, { projection: { defaultBrandColors: 1 } });
    const change = applyEventBrandColours(event as { brandColor?: unknown; brandBorderColor?: unknown }, { brandColor, brandBorderColor }, partnerRow?.defaultBrandColors as { primary?: string; secondary?: string } | undefined);
    if (!change.ok) throw apiBadRequest(change.error);
    Object.assign(updateFields, change.fields);
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
      if (await trackedSlugExists(db, norm.slug)) {
        throw apiBadRequest('This short URL is already used by a tracked link.');
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
      if (await trackedSlugExists(db, norm.slug)) {
        throw apiBadRequest('This Greatest Hits slug is already used by a tracked link.');
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
      // Outfit pairing kill switch (camera#116) - strictly opt-in, default off.
      outfitEnabled: tryOn?.outfitEnabled === true,
      applyFrameToReturnedResults: Boolean(tryOn?.applyFrameToReturnedResults),
      vettingEnabled: tryOn?.vettingEnabled !== false,
      localAiQualityGateEnabled: Boolean(tryOn?.localAiQualityGateEnabled),
      includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
      resultSlideshowMode,
    };
  }

  if (notifications !== undefined) {
    updateFields.notifications = normalizeEventNotificationSettings(notifications);
  }

  // The guided tour is off unless an editor turns it on (camera#356).
  if (tourEnabled !== undefined) {
    if (typeof tourEnabled !== 'boolean') throw apiBadRequest('tourEnabled must be true or false');
    updateFields.tourEnabled = tourEnabled;
  }
  // The language of the user interface (camera#352): a language we have, or empty for the default (English).
  if (uiLanguage !== undefined) {
    if (uiLanguage === null || uiLanguage === '') {
      updateFields.uiLanguage = null;
    } else if (isUiLanguage(uiLanguage)) {
      updateFields.uiLanguage = uiLanguage;
    } else {
      throw apiBadRequest('uiLanguage must be one of: ' + UI_LANGUAGES.join(', '));
    }
  }
  if (frameChoice !== undefined) {
    // Only `user` is stored; `random` and an empty value take the setting away, which means random (an event that never set it keeps what it always had).
    if (frameChoice === null || frameChoice === '' || frameChoice === 'random') {
      updateFields.frameChoice = null;
    } else if (frameChoice === 'user') {
      updateFields.frameChoice = 'user';
    } else {
      throw apiBadRequest('frameChoice must be random or user');
    }
  }
  if (visualSettings !== undefined) {
    updateFields.visualSettings = normalizeEventVisualSettings(visualSettings);
  }

  // Photo vetting (camera#263): only a global admin switches it, on or off.
  if (photoVetting !== undefined) {
    if (!isGlobalAdminSession(session)) {
      throw apiForbidden('Only a global admin can change photo vetting');
    }
    const setting = normalizePhotoVettingInput(photoVetting, session.user.email ?? null);
    if (!setting) {
      throw apiBadRequest('photoVetting.required must be true or false');
    }
    updateFields.photoVetting = setting;
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
        // accept pages need a checkbox: a list of checkboxes (each with a text and an optional https link, camera#330) or the single checkboxText
        const checkboxes = sanitizeCheckboxes(page.config.checkboxes);
        if (checkboxes.length === 0 && !page.config.checkboxText) {
          throw apiBadRequest('accept pages must have checkboxText or checkboxes in config');
        }
        page.config.checkboxes = checkboxes;
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
