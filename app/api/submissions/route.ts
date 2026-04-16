/**
 * Submissions API
 * 
 * POST: Save photo submission with frame to imgbb and MongoDB
 *       v2.0.0: Accepts userInfo and consents from custom event pages
 * GET: List user's submissions
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { uploadImage } from '@/lib/imgbb/upload';
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
  apiUnauthorized,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { formatFeelSoLine, normalizeFeelSoTagsList } from '@/lib/funfitfan/feel-so-tags';

/**
 * POST /api/submissions
 * Save a new photo submission
 * 
 * v2.0.0 additions:
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
      // v2.0.0: Custom page data
      userInfo,
      consents,
      funfitfanActivity,
      funfitfanResult,
      funfitfanFeelSoTags,
    } = body;

  // frameId can be null if event has no frames (v2.8.0)
  if (!imageData) {
    throw apiBadRequest('Image data is required');
  }

  if (partnerId && String(partnerId).trim() === FUNFITFAN_PARTNER_ID && !session?.user?.id) {
    throw apiUnauthorized('Sign in required for FunFitFan submissions');
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

    // Validate userInfo if provided (v2.0.0)
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

    // Validate consents if provided (v2.0.0)
    // Each consent must have: pageId, pageType, checkboxText, accepted, acceptedAt
    let validatedConsents = [];
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
          pageId: consent.pageId,
          pageType: consent.pageType,
          checkboxText: consent.checkboxText,
          accepted: true,
          acceptedAt: consent.acceptedAt || new Date().toISOString(),
        });
      }
    }

    const isFff = partnerId && String(partnerId).trim() === FUNFITFAN_PARTNER_ID;
    const feelSoTags = isFff ? normalizeFeelSoTagsList(funfitfanFeelSoTags) : [];
    const feelSoLine = feelSoTags.length > 0 ? formatFeelSoLine(feelSoTags) : '';

    if (isFff) {
      const act = typeof funfitfanActivity === 'string' ? funfitfanActivity.trim() : '';
      const allowed = await readFunFitFanSportActivities(db);
      if (!act || !allowed.includes(act)) {
        throw apiBadRequest('Choose a valid sport activity for FunFitFan.');
      }
    }

    // Save submission to database
    const submission = {
      userId: session?.user?.id || 'anonymous',
      userEmail: session?.user?.email || 'anonymous@event',
      userName: session?.user?.name || session?.user?.email || 'Event Guest',
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
      deleteUrl: uploadResult.deleteUrl,
      imageId: uploadResult.imageId,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      // v2.0.0: User info from onboarding pages (optional)
      ...(validatedUserInfo && { userInfo: validatedUserInfo }),
      // v2.0.0: Consent records from accept/CTA pages
      consents: validatedConsents,
      metadata: {
        device: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        finalFileSize: uploadResult.fileSize,
        // Image dimensions for slideshow aspect ratio detection (default 16:9 if no frame)
        finalWidth: imageWidth || frame?.width || 1920,
        finalHeight: imageHeight || frame?.height || 1080,
        ...(typeof funfitfanActivity === 'string' && funfitfanActivity.trim()
          ? { funfitfanActivity: funfitfanActivity.trim() }
          : {}),
        ...(feelSoTags.length > 0 ? { funfitfanFeelSoTags: feelSoTags } : {}),
        ...(feelSoLine
          ? { funfitfanResult: feelSoLine }
          : typeof funfitfanResult === 'string' && funfitfanResult.trim()
            ? { funfitfanResult: funfitfanResult.trim() }
            : {}),
      },
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection('submissions').insertOne(submission);

  return apiCreated({
    submission: {
      _id: result.insertedId,
      ...submission,
    },
  });
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
