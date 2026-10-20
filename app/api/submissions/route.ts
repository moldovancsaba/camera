/**
 * Submissions API
 * 
 * POST: Save photo submission with frame to imgbb and MongoDB
 *       Accepts optional userInfo and consents from custom event pages
 * GET: List user's submissions
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { head as blobHead, put as blobPut } from '@vercel/blob';
import { sanitizeReframeRecord } from '@/lib/camera/reframe';
import { blobStoreHostFromToken, verifyOriginalImage } from '@/lib/submissions/original-image';
import { logWarn } from '@/lib/observability/logger';
import { dispatchArrivedEmail } from '@/lib/email/triggers';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { deviceMetadataOf } from '@/lib/device/coarse';
import { ensureScreenPicture } from '@/lib/submissions/screen-picture';
import { sanitizeFrameVariant, type RecordedFrameVariant } from '@/lib/frame/capture';
import { photoVettingRequired } from '@/lib/events/photo-vetting';
import { effectiveGalleryConsent, galleryChoice } from '@/lib/events/gallery-consent';
import { effectiveCheckboxes } from '@/lib/events/checkbox-settings';
import { GALLERY_MISSING_MESSAGE, mayRefuse, missingRequiredConsent, type GuardEvent } from '@/lib/events/consent-guard';
import { eventGetsDefaults, getDefaultsRollout } from '@/lib/admin/defaults-rollout';
import { guestIdentity, newShareToken, storePendingPhoto } from '@/lib/photo-vetting/pending';
import {
  COLLECTIONS,
  SubmissionMethod,
  SubmissionStatus,
  type UserConsent,
  type Submission,
} from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  optionalAuth,
  parsePaginationParams,
  validateRequiredFields,
  apiSuccess,
  apiCreated,
  apiNotFound,
  apiBadRequest,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';
import { safeLinkUrl } from '@/lib/events/consent';
import { scheduleCounterSync } from '@/lib/analytics/counters-trigger';
interface EventLookupFilter {
  $or: Array<Record<string, unknown>>;
}

function buildEventLookupFilterByIdentifier(eventId: string): EventLookupFilter {
  const normalized = eventId.trim();
  const query: EventLookupFilter = { $or: [{ eventId: normalized }, { shortUrlSlug: normalized }] };

  if (ObjectId.isValid(normalized)) {
    query.$or.push({ _id: new ObjectId(normalized) });
  }

  return query;
}

function getSubmissionMongoIdString(id: unknown): string {
  if (typeof id === 'string' && id.trim()) {
    return id.trim();
  }

  if (id && typeof id === 'object' && 'toString' in id && typeof id.toString === 'function') {
    return id.toString();
  }

  return '';
}

/**
 * POST /api/submissions
 * Save a new photo submission
 * 
 * Optional event-flow data:
 * - userInfo: {name, email} collected from 'who-are-you' pages
 * - consents: Array of {pageId, pageType, checkboxText, accepted, acceptedAt} from 'accept'/'cta' pages
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await checkRateLimit(request, RATE_LIMITS.UPLOAD);

  // Check authentication (optional for event submissions)
  const session = await optionalAuth();

    // Parse request body
    const body = await request.json();
    const promptFields = ['prompt', 'promptSnapshot', 'promptOverride', 'positivePrompt', 'negativePrompt'];
    if (promptFields.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      throw apiBadRequest('Prompt fields are managed by Camera operators and are not accepted on guest submissions');
    }
    const { 
      imageData, 
      frameId, 
      eventId, 
      eventName, 
      partnerId, 
      partnerName, 
      imageWidth, 
      imageHeight,
      // The pure full-frame camera image the browser uploaded straight to Blob (camera#210), its
      // size, and how it was framed. Verified below; absent for older clients.
      originalImageUrl: claimedOriginalUrl,
      originalImageWidth,
      originalImageHeight,
      reframe: claimedReframe,
      // The message and image of the generated default frame the photo used (camera#236); checked below.
      frameVariant: claimedFrameVariant,
      // Custom page data
      userInfo,
      consents,
      // Public pledge-wall share choice from the capture flow. The capture UI's checkbox
      // defaults to checked (d9488b5); a request that omits shareOptIn stores false.
      // POST /api/internal/savetheworld/events/[eventId]/publish-selfies can later set
      // isShareVisible true in bulk for an event. Only meaningful for plain ('original')
      // captures.
      shareOptIn,
      // The version of the sentence the user ticked when the event asks for the permission to show the photo in the public gallery (issue 554, lib/events/gallery-consent.ts).
      publicGalleryConsentVersion,
      sourceSlug: claimedSourceSlug,
    } = body;

  // frameId can be null if the event has no frames
  if (!imageData) {
    throw apiBadRequest('Image data is required');
  }

  // Photo vetting (camera#266): read from the event, never from the client. A vetted event saves the photo pending, with nothing public.
  const db = await connectToDatabase();
  const vettingEvent =
    typeof eventId === 'string' && eventId.trim()
      ? ((await db.collection(COLLECTIONS.EVENTS).findOne(buildEventLookupFilterByIdentifier(eventId), {
          projection: { eventId: 1, messmassEventId: 1, photoVetting: 1, galleryConsent: 1, partnerId: 1, consentSettings: 1, acceptanceOnWhoAreYou: 1, customPages: 1, journeyDefaults: 1, defaultPageOrders: 1, shortUrlSlug: 1 },
        })) as (GuardEvent & { _id: unknown; galleryConsent?: unknown; partnerId?: unknown; journeyDefaults?: unknown }) | null)
      : null;
  const vetted = photoVettingRequired(vettingEvent);
  // Source attribution is accepted only when it names a real tracked link for this event (or its own short address).
  // The raw query string is never stored as a label or analytics key.
  let sourceLinkSlug: string | null = null;
  if (typeof claimedSourceSlug === 'string' && /^[a-z0-9-]{1,32}$/.test(claimedSourceSlug) && vettingEvent?._id) {
    const sourceLink = await db.collection(COLLECTIONS.SHORT_LINKS).findOne({ slug: claimedSourceSlug, eventId: String(vettingEvent._id) }, { projection: { _id: 1 } });
    const isOwnShortLink = (vettingEvent as { shortUrlSlug?: unknown }).shortUrlSlug === claimedSourceSlug;
    if (sourceLink || isOwnShortLink) sourceLinkSlug = claimedSourceSlug;
  }
  // The partner's defaults for the public gallery permission and the other checkbox settings (issues 554 and 558): read from the event's partner, never from what the page says it asked.
  const settingsPartner =
    vettingEvent && typeof vettingEvent.partnerId === 'string' && vettingEvent.partnerId
      ? ((await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: vettingEvent.partnerId }, { projection: { galleryConsent: 1, acceptanceOnWhoAreYou: 1, consentSettings: 1 } })) as { galleryConsent?: unknown; acceptanceOnWhoAreYou?: unknown; consentSettings?: unknown } | null)
      : null;
  // Whether the event asks for the user's own permission to show the photo in the public gallery (issue 554): from the event's setting and its partner's, never from what the page says it asked.
  const gallerySetting = effectiveGalleryConsent(vettingEvent, settingsPartner);
  const galleryRequired = effectiveCheckboxes(vettingEvent, settingsPartner).gallery.checked;

  // Required consent no longer blocks the established upload. Keep the check as a retention signal:
  // the photo stays private while consent is missing and is deleted after 24 hours if none arrives.
  let consentRefusal: string | null = null;
  if (vettingEvent && mayRefuse(vettingEvent, settingsPartner)) {
    consentRefusal = missingRequiredConsent(
      vettingEvent,
      settingsPartner,
      { consents: Array.isArray(consents) ? consents : [], shareOptIn, publicGalleryConsentVersion },
      { consentDefault: eventGetsDefaults(vettingEvent, await getDefaultsRollout(db)), vettingRequired: vetted },
    );
  }

    // Check the claimed full-frame original before anything is uploaded or stored (camera#210).
    // A claim outside this event's folder of our own Blob store, or not a JPEG of an allowed size,
    // rejects the request; a file that cannot be confirmed only drops the original, never the photo.
    const originalCheck = vetted
      ? ({ kind: 'none' } as const)
      : await verifyOriginalImage({
          url: claimedOriginalUrl,
          width: originalImageWidth,
          height: originalImageHeight,
          eventId,
          storeHost: blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN),
          head: async (url) => {
            const found = await blobHead(url);
            return { size: found.size, contentType: found.contentType };
          },
        });
    if (originalCheck.kind === 'invalid') {
      throw apiBadRequest(originalCheck.reason);
    }
    if (originalCheck.kind === 'unverified') {
      logWarn('submissions.original_unverified', 'The claimed original image could not be confirmed; saving without it', {
        eventId: typeof eventId === 'string' ? eventId : null,
      });
    }
    const verifiedOriginal = originalCheck.kind === 'ok' ? originalCheck.original : null;

    // A distinct original always comes with the record of how it was framed, and nothing else
    // does: the record is what marks the original as private (lib/submissions/public-image.ts).
    const reframeRecord = verifiedOriginal ? sanitizeReframeRecord(claimedReframe) : null;
    if (verifiedOriginal && !reframeRecord) {
      throw apiBadRequest('The reframe record for the original image is missing or invalid');
    }

    // Convert base64 to buffer and upload to imgbb
    const base64Data = imageData.split(',')[1]; // Remove data:image/png;base64, prefix
    const uploadResult = vetted
      ? null
      : await uploadImage(base64Data, {
          name: `submission-${Date.now()}`,
        });

    // Get frame details from database (using frameId UUID)
    // Frame is optional - events with 0 frames submit frameId=null
    let frame = null;
    
    if (frameId) {
      frame = await db.collection('frames').findOne({ frameId });
      if (!frame) {
        throw apiNotFound('Frame');
      }
    }

    // The generated default frame applies only to a photo without a frame of its own. A claim that is not one of this
    // project's generated frame images is dropped; the photo still saves.
    let frameVariant: RecordedFrameVariant | null = null;
    if (!frame && claimedFrameVariant !== undefined && claimedFrameVariant !== null) {
      frameVariant = sanitizeFrameVariant(claimedFrameVariant, blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN));
      if (!frameVariant) {
        logWarn('submissions.frame_variant_dropped', 'The claimed generated frame variant is not valid; saving without it', {
          eventId: typeof eventId === 'string' ? eventId : null,
        });
      }
    }

    // Validate userInfo if provided
    // If userInfo is provided from 'who-are-you' page, validate structure
    let validatedUserInfo = undefined;
    if (userInfo) {
      if (!userInfo.name || !userInfo.email) {
        throw apiBadRequest('userInfo must include both name and email');
      }
      validatedUserInfo = {
        name: userInfo.name.trim(),
        email: userInfo.email.trim(),
        collectedAt: new Date().toISOString(),
      };
    }

    // Validate consents if provided
    // Each consent must have: pageId, pageType, checkboxText, accepted, acceptedAt
    const validatedConsents: UserConsent[] = [];
    if (consents && Array.isArray(consents)) {
      for (const consent of consents) {
        validateRequiredFields(consent, ['pageId', 'pageType', 'checkboxText', 'accepted']);
        
        if (consent.pageType !== 'accept' && consent.pageType !== 'cta') {
          throw apiBadRequest('consent pageType must be "accept" or "cta"');
        }
        
        // A record says "not ticked" only for an optional checkbox that was shown and left unticked (issue 558): it says so itself with required=false. Every other record is a ticked box, as it always was.
        const optional = consent.required === false;
        if (consent.accepted !== true && !(optional && consent.accepted === false)) {
          throw apiBadRequest('All consents must have accepted=true');
        }

        validatedConsents.push({
          pageId: String(consent.pageId),
          pageType: consent.pageType,
          checkboxText: String(consent.checkboxText),
          ...(consent.kind === 'terms' || consent.kind === 'cookies' || consent.kind === 'privacy' || consent.kind === 'marketing' ? { kind: consent.kind } : {}),
          ...(safeLinkUrl(consent.linkUrl) ? { linkUrl: safeLinkUrl(consent.linkUrl) } : {}),
          ...(typeof consent.shownText === 'string' && consent.shownText.trim() ? { shownText: consent.shownText.trim().slice(0, 600) } : {}),
          accepted: consent.accepted === true,
          acceptedAt:
            typeof consent.acceptedAt === 'string' && consent.acceptedAt.trim()
              ? consent.acceptedAt
              : new Date().toISOString(),
          ...(optional ? { required: false as const } : {}),
        });
      }
    }

    // A vetted event needs to know who the guest is (the approval email goes there) and keeps the plain photo privately.
    const createdAt = new Date().toISOString();
    const consentExpiresAt = consentRefusal ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    // A capture can arrive before the guest completes login or the Who-are-you
    // step. Persist it privately for 24 hours so a reload can resume, then erase
    // it if no actual identity is attached. This is independent of consent and
    // is never a Fanmass/analytics eligibility signal.
    const hasUserIdentity = Boolean(
      validatedUserInfo?.email ||
      (session?.user?.id && session.user.id !== 'anonymous')
    );
    const retentionExpiresAt = hasUserIdentity ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // What the request and the event's setting make of the public gallery choice: `shareOptIn` (eligible for the wall) and the evidence of a ticked box.
    const wall = galleryChoice(gallerySetting, { shareOptIn, publicGalleryConsentVersion }, createdAt, galleryRequired);
    let identity: ReturnType<typeof guestIdentity> = null;
    let pendingPhoto: Awaited<ReturnType<typeof storePendingPhoto>> | null = null;
    if (vetted) {
      identity = guestIdentity(validatedUserInfo, session);
      try {
        pendingPhoto = await storePendingPhoto(imageData, String(vettingEvent?._id ?? 'event'), { put: (pathname, body, options) => blobPut(pathname, body, options) });
      } catch (storeError) {
        throw apiBadRequest(storeError instanceof Error ? storeError.message : 'The photo could not be stored');
      }
    }

    // Save submission to database
    const submission = {
      submissionId: `submission_${Date.now()}`,
      userId: session?.user?.id || 'anonymous',
      userEmail: session?.user?.email || validatedUserInfo?.email || 'anonymous@event',
      userName: session?.user?.name || session?.user?.email || validatedUserInfo?.name || (session?.user?.id ? 'REGISTERED USER' : 'NO USER'),
      // Frame data (null if no frame assigned to event)
      frameId: frame?.frameId || null,
      frameName: frame?.name || null,
      frameCategory: frame?.category || null,
      // Which generated-frame image (and message) this photo used (camera#236)
      ...(frameVariant ? { frameVariant } : {}),
      // Partner/Event context (for gallery filtering)
      partnerId: partnerId || null,
      partnerName: partnerName || null,
      eventId: eventId || null,
      // Normalize for slideshow + queries: always mirror event UUID into eventIds when present
      ...(eventId ? { eventIds: [eventId] } : { eventIds: [] }),
      eventName: eventName || null,
      // A pending photo has no public picture: the composite is made at approval (camera#266).
      ...(uploadResult
        ? {
            imageUrl: uploadResult.imageUrl,
            // The full-frame original when the browser uploaded one (private; never in a public response),
            // otherwise the composite as before.
            originalImageUrl: verifiedOriginal?.url ?? uploadResult.imageUrl,
            finalImageUrl: uploadResult.imageUrl,
            ...(verifiedOriginal && reframeRecord ? { reframe: reframeRecord } : {}),
            deleteUrl: uploadResult.deleteUrl,
            imageId: uploadResult.imageId,
            fileSize: uploadResult.fileSize,
            mimeType: uploadResult.mimeType,
          }
        : {
            fileSize: pendingPhoto?.size ?? null,
            mimeType: pendingPhoto?.mime ?? null,
            reviewStatus: 'pending_review',
            photoReview: {
              photoUrl: pendingPhoto?.url ?? '',
              photoSize: pendingPhoto?.size ?? 0,
              photoMime: pendingPhoto?.mime ?? 'image/jpeg',
              shareOptIn: wall.shareOptIn,
              submittedAt: createdAt,
            },
            shareToken: newShareToken(),
            reviewHistory: [],
          }),
      submissionKind: 'original',
      // Public pledge-wall visibility: true only when shareOptIn === true in the request
      // (the capture UI's checkbox defaults to checked); false otherwise. May later be
      // bulk-set to true by publish-selfies (see the shareOptIn note above).
      isShareVisible: vetted || consentRefusal || !hasUserIdentity ? false : wall.shareOptIn,
      // Explicitly persist a successful consent path. Downstream consumers must
      // never guess that a missing status means the user accepted.
      consentStatus: consentRefusal ? 'pending' : 'received',
      ...(consentRefusal ? { consentShareOptIn: wall.shareOptIn } : {}),
      ...(consentRefusal ? {
        consentExpiresAt,
        consentPendingReason: consentRefusal === GALLERY_MISSING_MESSAGE ? 'gallery' : 'acceptance',
      } : {}),
      ...(!hasUserIdentity ? { retentionStatus: 'pending_erasure', retentionExpiresAt } : {}),
      ...(wall.consent ? { publicGalleryConsent: wall.consent } : {}),
      // User info from onboarding pages (a social login gives the email without the page)
      ...(validatedUserInfo
        ? { userInfo: validatedUserInfo }
        : vetted && identity
          ? { userInfo: { name: identity.name ?? '', email: identity.email, collectedAt: createdAt } }
          : {}),
      // Consent records from accept/CTA pages
      consents: validatedConsents,
      method: SubmissionMethod.CAMERA_CAPTURE,
      status: SubmissionStatus.COMPLETED,
      metadata: {
        // Only a coarse device (decision 243, issue 521): the class and the browser family, made from the user agent, which is not kept; and no IP address. Photos taken before this change still hold both; the
        // Analytics Devices figure reads the class, else classifies the stored string (lib/analytics/facts.ts).
        ...deviceMetadataOf(request.headers.get('user-agent')),
        ...(sourceLinkSlug ? { sourceLinkSlug } : {}),
        originalWidth: verifiedOriginal?.width ?? (imageWidth || frame?.width || 1920),
        originalHeight: verifiedOriginal?.height ?? (imageHeight || frame?.height || 1080),
        originalFileSize: verifiedOriginal?.fileSize ?? (uploadResult?.fileSize || pendingPhoto?.size || 0),
        originalMimeType: verifiedOriginal?.mimeType ?? (uploadResult?.mimeType || pendingPhoto?.mime || 'image/png'),
        finalFileSize: uploadResult?.fileSize ?? pendingPhoto?.size,
        // Image dimensions for slideshow aspect ratio detection (default 16:9 if no frame)
        finalWidth: imageWidth || frame?.width || 1920,
        finalHeight: imageHeight || frame?.height || 1080,
        emailSent: false,
        compositionEngine: vetted ? 'camera_capture_pending' : 'camera_capture',
        identityStatus: session?.user?.id && session.user.id !== 'anonymous'
          ? 'REGISTERED'
          : validatedUserInfo?.email
            ? 'EMAIL'
            : 'NO USER',
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      createdAt,
      updatedAt: createdAt,
    } as unknown as Submission;

    const result = await db.collection('submissions').insertOne(submission);
    const submissionId = getSubmissionMongoIdString(result.insertedId);
    scheduleCounterSync(db, vettingEvent as unknown as Record<string, unknown> | null);

    // The "arrived" e-mail (epic 463), when the event has it on and the user's address is already known: after the answer is sent, so it never slows the photo. Without an address yet
    // the finalize call sends it once the contact is saved.
    runAfterResponse(async () => {
      try {
        const arrived = await dispatchArrivedEmail(db, { ...submission, _id: result.insertedId });
        if (arrived && Object.keys(arrived.metadataPatch).length > 0) await db.collection('submissions').updateOne({ _id: result.insertedId }, { $set: arrived.metadataPatch });
      } catch (error) {
        logWarn('submission.arrived_email_failed', 'The arrived e-mail could not be sent', { submissionId, error: error instanceof Error ? error.message : String(error) });
      }
    });

    // A photo that is public at once (an event without photo approval) gets its screen-sized picture for the giant screen after the answer (camera#476, S7);
    // a pending one gets it when it is approved.
    if (!vetted && typeof submission.imageUrl === 'string') {
      runAfterResponse(async () => {
        await ensureScreenPicture(db, { _id: result.insertedId, imageUrl: submission.imageUrl, finalImageUrl: submission.finalImageUrl });
      });
    }

    // A pending photo answers with what the waiting screen needs and nothing public: no picture, no share link (camera#266).
    if (vetted) {
      return apiCreated({
        submission: { _id: result.insertedId, reviewStatus: 'pending_review', metadata: { emailSent: false } },
        pending: true,
      });
    }
    const createdSubmission = {
      _id: result.insertedId,
      ...submission,
    };

    return apiCreated({ submission: createdSubmission });
});

/**
 * GET /api/submissions
 * Get user's submissions with pagination
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  // Check authentication
  const session = await requireAuth();

  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);

    const db = await connectToDatabase();

    // Get total count
    const total = await db
      .collection('submissions')
      .countDocuments({ userId: session.user.id });

    // Get paginated results
    const submissions = await db
      .collection('submissions')
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

  return apiSuccess({
    submissions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
