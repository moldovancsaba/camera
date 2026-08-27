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
import {
  COLLECTIONS,
  DeviceType,
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
import {
  buildSubmissionTryOnLink,
  insertOrGetTryOnJob,
  patchSubmissionTryOnState,
  upsertSubmissionTryOnLink,
} from '@/lib/tryon/jobs';
import { assertValidLeatherSuitId } from '@/lib/tryon/suits';
import { findDefaultSetupForGarmentType } from '@/lib/tryon/setup-resolution';
interface TryOnRequestDetails {
  requested: boolean;
  leatherSuitId: string | null;
  sourceImageData: string | null;
  setupId?: string | null;
  cameraId?: string | null;
  outfitBottomLeatherSuitId?: string | null;
}

interface SubmissionEventDocument {
  _id: string;
  name?: string;
  notifications?: {
    submissionResultEmailEnabled?: boolean;
    submissionResultEmailSendAfterSave?: boolean;
    submissionResultEmailSendAfterRelatedPhotosReady?: boolean;
    submissionResultEmailSendAfterTryOnResubmissionApproved?: boolean;
    submissionResultEmailSubject?: string | null;
    submissionResultEmailBody?: string | null;
    submissionResultEmailSubjectAfterSave?: string | null;
    submissionResultEmailBodyAfterSave?: string | null;
    submissionResultEmailSubjectAfterRelatedPhotosReady?: string | null;
    submissionResultEmailBodyAfterRelatedPhotosReady?: string | null;
    submissionResultEmailSubjectAfterTryOnResubmissionApproved?: string | null;
    submissionResultEmailBodyAfterTryOnResubmissionApproved?: string | null;
    submissionResultEmailSenderName?: string | null;
  };
  tryOn?: {
    enabled?: boolean;
    allowedLeatherSuitIds?: string[];
    setupId?: string | null;
  };
}

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

function normalizeTryOnRequest(body: Record<string, unknown>): TryOnRequestDetails {
  const leatherSuitIdRaw = body.leatherSuitId ?? body.leather_suit_id;
  const requestFlagRaw = body.requestTryOn ?? body.request_try_on ?? leatherSuitIdRaw;
  const sourceImageRaw = body.tryOnSourceImageData ?? body.try_on_source_image_data;
  const setupIdRaw = body.setupId ?? body.setup_id;
  const cameraIdRaw = body.cameraId ?? body.camera_id;
  const outfitBottomRaw = body.outfitBottomLeatherSuitId ?? body.outfit_bottom_leather_suit_id;

  const leatherSuitId =
    typeof leatherSuitIdRaw === 'string' && leatherSuitIdRaw.trim() ? leatherSuitIdRaw.trim() : null;
  const requested = Boolean(requestFlagRaw) || Boolean(leatherSuitId);
  const sourceImageData =
    typeof sourceImageRaw === 'string' && sourceImageRaw.trim() ? sourceImageRaw.trim() : null;
  const setupId =
    typeof setupIdRaw === 'string' && setupIdRaw.trim() ? setupIdRaw.trim() : null;
  const cameraId =
    typeof cameraIdRaw === 'string' && cameraIdRaw.trim() ? cameraIdRaw.trim() : null;
  const outfitBottomLeatherSuitId =
    typeof outfitBottomRaw === 'string' && outfitBottomRaw.trim() ? outfitBottomRaw.trim() : null;

  return {
    requested,
    leatherSuitId,
    sourceImageData,
    setupId,
    cameraId,
    outfitBottomLeatherSuitId,
  };
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
    const { 
      imageData, 
      frameId, 
      eventId, 
      eventName, 
      partnerId, 
      partnerName, 
      imageWidth, 
      imageHeight,
      // Custom page data
      userInfo,
      consents,
    } = body;
  const tryOnRequest = normalizeTryOnRequest(body);

  // frameId can be null if the event has no frames
  if (!imageData) {
    throw apiBadRequest('Image data is required');
  }

    // Convert base64 to buffer and upload to imgbb
    const base64Data = imageData.split(',')[1]; // Remove data:image/png;base64, prefix
    const uploadResult = await uploadImage(base64Data, {
      name: `submission-${Date.now()}`,
    });

    // Get frame details from database (using frameId UUID)
    // Frame is optional - events with 0 frames submit frameId=null
    const db = await connectToDatabase();
    let frame = null;
    
    if (frameId) {
      frame = await db.collection('frames').findOne({ frameId });
      if (!frame) {
        throw apiNotFound('Frame');
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
        
        if (consent.accepted !== true) {
          throw apiBadRequest('All consents must have accepted=true');
        }

        validatedConsents.push({
          pageId: String(consent.pageId),
          pageType: consent.pageType,
          checkboxText: String(consent.checkboxText),
          accepted: true,
          acceptedAt:
            typeof consent.acceptedAt === 'string' && consent.acceptedAt.trim()
              ? consent.acceptedAt
              : new Date().toISOString(),
        });
      }
    }

    // Save submission to database
    const createdAt = new Date().toISOString();
    const submission: Submission = {
      submissionId: `submission_${Date.now()}`,
      userId: session?.user?.id || 'anonymous',
      userEmail: session?.user?.email || 'anonymous@event',
      userName: session?.user?.name || 'Guest',
      // Frame data (null if no frame assigned to event)
      frameId: frame?.frameId || null,
      frameName: frame?.name || null,
      frameCategory: frame?.category || null,
      // Partner/Event context (for gallery filtering)
      partnerId: partnerId || null,
      partnerName: partnerName || null,
      eventId: eventId || null,
      // Normalize for slideshow + queries: always mirror event UUID into eventIds when present
      ...(eventId ? { eventIds: [eventId] } : { eventIds: [] }),
      eventName: eventName || null,
      imageUrl: uploadResult.imageUrl,
      originalImageUrl: uploadResult.imageUrl,
      finalImageUrl: uploadResult.imageUrl,
      deleteUrl: uploadResult.deleteUrl,
      imageId: uploadResult.imageId,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      submissionKind: 'original',
      // User info from onboarding pages
      ...(validatedUserInfo && { userInfo: validatedUserInfo }),
      // Consent records from accept/CTA pages
      consents: validatedConsents,
      method: SubmissionMethod.CAMERA_CAPTURE,
      status: SubmissionStatus.COMPLETED,
      metadata: {
        deviceType: DeviceType.UNKNOWN,
        deviceInfo: request.headers.get('user-agent') || undefined,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        originalWidth: imageWidth || frame?.width || 1920,
        originalHeight: imageHeight || frame?.height || 1080,
        originalFileSize: uploadResult.fileSize || 0,
        originalMimeType: uploadResult.mimeType || 'image/png',
        finalFileSize: uploadResult.fileSize,
        // Image dimensions for slideshow aspect ratio detection (default 16:9 if no frame)
        finalWidth: imageWidth || frame?.width || 1920,
        finalHeight: imageHeight || frame?.height || 1080,
        emailSent: false,
        compositionEngine: 'camera_capture',
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      tryOnRequest: tryOnRequest.requested
        ? {
            requested: true,
            status: 'requested',
            requestedAt: createdAt,
            lastUpdatedAt: createdAt,
            leatherSuitId: tryOnRequest.leatherSuitId,
            reviewStatus: null,
            shareVisible: false,
            slideshowEligible: false,
            lastError: null,
          }
        : {
            requested: false,
            status: 'not_requested',
            requestedAt: null,
            lastUpdatedAt: createdAt,
            leatherSuitId: null,
            reviewStatus: null,
            shareVisible: false,
            slideshowEligible: false,
            lastError: null,
          },
      tryOnJobs: [],
      createdAt,
      updatedAt: createdAt,
    };

    const result = await db.collection('submissions').insertOne(submission);
    const submissionId = getSubmissionMongoIdString(result.insertedId);
    const createdSubmission = {
      _id: result.insertedId,
      ...submission,
    };

    const created: {
      submission: typeof createdSubmission;
      tryOn: {
        requested: boolean;
        status: 'not_requested' | 'queued' | 'deduplicated' | 'enqueue_failed';
        leatherSuitId: string | null;
        jobId: string | null;
        error: string | null;
      };
    } = {
      submission: createdSubmission,
      tryOn: {
        requested: false,
        status: 'not_requested',
        leatherSuitId: null,
        jobId: null,
        error: null,
      },
    };

    const eventPolicy: SubmissionEventDocument | null = eventId
      ? ((await db.collection(COLLECTIONS.EVENTS).findOne(
          buildEventLookupFilterByIdentifier(eventId),
          { projection: { notifications: 1, name: 1, tryOn: 1 } }
        )) as SubmissionEventDocument | null)
      : null;

    if (tryOnRequest.requested) {
      created.tryOn.requested = true;
      created.tryOn.leatherSuitId = tryOnRequest.leatherSuitId;

      const resolvedSetupId =
        tryOnRequest.setupId ??
        (!tryOnRequest.cameraId
          ? eventPolicy?.tryOn?.setupId && eventPolicy.tryOn.setupId.trim()
            ? eventPolicy.tryOn.setupId.trim()
            : null
          : null);

      try {
        if (!tryOnRequest.leatherSuitId) {
          throw new Error('leather_suit_id is required when try-on is requested');
        }
        if (!tryOnRequest.sourceImageData) {
          throw new Error('try_on_source_image_data is required when try-on is requested');
        }

        if (eventId) {
          const eventPolicyForTryOn = eventPolicy
            ? ({ _id: null, tryOn: eventPolicy.tryOn })
            : await db.collection(COLLECTIONS.EVENTS).findOne(
                buildEventLookupFilterByIdentifier(eventId),
                { projection: { _id: 1, tryOn: 1 } }
              );
          if (!eventPolicyForTryOn?.tryOn?.enabled) {
            throw new Error('try_on_not_enabled_for_event');
          }
          const allowedSuitIds = Array.isArray(eventPolicyForTryOn?.tryOn?.allowedLeatherSuitIds)
            ? eventPolicyForTryOn.tryOn.allowedLeatherSuitIds
            : [];
          if (
            allowedSuitIds.length > 0 &&
            !allowedSuitIds.includes(tryOnRequest.leatherSuitId)
          ) {
            throw new Error('leather_suit_not_allowed_for_event');
          }
          if (tryOnRequest.outfitBottomLeatherSuitId) {
            // Outfit pairing (try-on#39 contract, implemented here per
            // camera#116). The flag is read from the event document at
            // submit time, never trusted from the client; the allowlist
            // rule applies to BOTH pieces.
            if (eventPolicyForTryOn?.tryOn?.outfitEnabled !== true) {
              throw new Error('outfit_not_enabled_for_event');
            }
            if (
              allowedSuitIds.length > 0 &&
              !allowedSuitIds.includes(tryOnRequest.outfitBottomLeatherSuitId)
            ) {
              throw new Error('leather_suit_not_allowed_for_event');
            }
          }
        } else if (tryOnRequest.outfitBottomLeatherSuitId) {
          // Outfit selection is an event-scoped feature; the eventless
          // capture flow has no outfitEnabled policy to validate against.
          throw new Error('outfit_not_enabled_for_event');
        }

        const selectedGarment = await assertValidLeatherSuitId(db, tryOnRequest.leatherSuitId);

        // Garment-type default (defaultForGarmentTypes on a setup): more
        // specific than the event's generic tryOn.setupId, so it wins over it
        // when the request itself named no setup. A full-body leather-suit
        // setup on the event must not drive a short-sleeve jersey render.
        const garmentDefaultSetup = !tryOnRequest.setupId
          ? await findDefaultSetupForGarmentType(db, selectedGarment.garmentType || 'motorsport_suit')
          : null;
        const finalSetupId = tryOnRequest.setupId ?? garmentDefaultSetup?.setupId ?? resolvedSetupId;
        if (tryOnRequest.outfitBottomLeatherSuitId) {
          // Server-side type pairing, mirroring the worker's own claim-time
          // validation (defense in depth): the primary garment must be a
          // 'top' and the paired piece a 'bottom'.
          if ((selectedGarment.garmentType || 'motorsport_suit') !== 'top') {
            throw new Error('outfit_top_type_required');
          }
          const bottomGarment = await assertValidLeatherSuitId(db, tryOnRequest.outfitBottomLeatherSuitId);
          if (bottomGarment.garmentType !== 'bottom') {
            throw new Error('outfit_bottom_type_mismatch');
          }
        }

        const sourceBase64 = tryOnRequest.sourceImageData.split(',')[1];
        if (!sourceBase64) {
          throw new Error('try_on_source_image_data must be a valid base64 data URL');
        }

        const sourceUpload = await uploadImage(sourceBase64, {
          name: `tryon-source-${Date.now()}`,
        });

        const eventDocument = eventId
          ? await db.collection(COLLECTIONS.EVENTS).findOne(
              buildEventLookupFilterByIdentifier(eventId),
              { projection: { _id: 1 } }
            )
          : null;

        const linkedJob = await insertOrGetTryOnJob(db, {
          submissionId,
          imageUrl: sourceUpload.imageUrl,
          leatherSuitId: tryOnRequest.leatherSuitId,
          garmentType: selectedGarment.garmentType || 'motorsport_suit',
          sleeveStyle: selectedGarment.sleeveStyle ?? null,
          outfitBottomLeatherSuitId: tryOnRequest.outfitBottomLeatherSuitId ?? null,
          setupId: finalSetupId,
          cameraId: tryOnRequest.cameraId,
          eventId: typeof eventId === 'string' ? eventId : null,
          eventMongoId: eventDocument?._id ? getSubmissionMongoIdString(eventDocument._id) : null,
          partnerId: typeof partnerId === 'string' ? partnerId : null,
          userId: session?.user?.id || 'anonymous',
        });

        if (ObjectId.isValid(submissionId)) {
          const submissionObjectId = new ObjectId(submissionId);
          await patchSubmissionTryOnState(db, submissionObjectId, {
            status: 'source_uploaded',
            requested: true,
            requestedAt: createdAt,
            leatherSuitId: tryOnRequest.leatherSuitId,
            sourceImageUrl: sourceUpload.imageUrl,
            sourceDeleteUrl: sourceUpload.deleteUrl ?? null,
            sourceImageId: sourceUpload.imageId ?? null,
            reviewStatus: null,
            shareVisible: false,
            slideshowEligible: false,
            lastError: null,
          });

          await upsertSubmissionTryOnLink(
            db,
            submissionObjectId,
            buildSubmissionTryOnLink(
              linkedJob.job,
              linkedJob.deduplicated ? linkedJob.job.status : 'queued',
              linkedJob.job.result.publicResultUrl ?? null
            )
          );

          await patchSubmissionTryOnState(db, submissionObjectId, {
            status: linkedJob.deduplicated ? linkedJob.job.status : 'queued',
            requested: true,
            requestedAt: createdAt,
            leatherSuitId: tryOnRequest.leatherSuitId,
            jobId: linkedJob.job.jobId,
            sourceImageUrl: sourceUpload.imageUrl,
            sourceDeleteUrl: sourceUpload.deleteUrl ?? null,
            sourceImageId: sourceUpload.imageId ?? null,
            resultUrl: linkedJob.job.result.publicResultUrl ?? null,
            resultDeleteUrl: linkedJob.job.result.imgbbDeleteUrl ?? null,
            resultProvider: linkedJob.job.result.provider ?? null,
            reviewStatus: null,
            shareVisible: false,
            slideshowEligible: false,
            lastError: null,
          });
        }

        created.tryOn.status = linkedJob.deduplicated ? 'deduplicated' : 'queued';
        created.tryOn.jobId = linkedJob.job.jobId;
      } catch (tryOnError: unknown) {
        created.tryOn.status = 'enqueue_failed';
        created.tryOn.error =
          tryOnError instanceof Error ? tryOnError.message : 'Unable to enqueue try-on job';

        if (ObjectId.isValid(submissionId)) {
          await patchSubmissionTryOnState(db, new ObjectId(submissionId), {
            status: 'enqueue_failed',
            requested: true,
            requestedAt: createdAt,
            leatherSuitId: tryOnRequest.leatherSuitId,
            reviewStatus: null,
            shareVisible: false,
            slideshowEligible: false,
            lastError: created.tryOn.error,
          });
        }
      }
    }

    return apiCreated(created);
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
