import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';
import { upsertPartnerUserAccess } from '@/lib/partners/access';

const E2E_PARTNER_ID = 'e2e-partner';
const E2E_PARTNER_NAME = 'E2E Partner';
const E2E_EVENT_ID = 'e2e-event';
const E2E_EVENT_NAME = 'E2E Event Instance';

export async function POST() {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  const db = await connectToDatabase();
  const now = generateTimestamp();

  let partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: E2E_PARTNER_ID });
  if (!partner) {
    const result = await db.collection(COLLECTIONS.PARTNERS).insertOne({
      partnerId: E2E_PARTNER_ID,
      name: E2E_PARTNER_NAME,
      description: 'E2E smoke-test partner',
      isActive: true,
      defaultFrames: [],
      defaultLogos: [],
      createdBy: 'system:e2e',
      createdAt: now,
      updatedAt: now,
    });
    partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: result.insertedId });
  }

  let event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: E2E_EVENT_ID });
  if (!event) {
    const result = await db.collection(COLLECTIONS.EVENTS).insertOne({
      eventId: E2E_EVENT_ID,
      name: E2E_EVENT_NAME,
      description: 'E2E smoke-test event',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      isActive: true,
      frames: [],
      logos: [],
      customPages: [],
      showLogo: false,
      createdBy: 'system:e2e',
      createdAt: now,
      updatedAt: now,
    });
    event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: result.insertedId });
  }

  await upsertPartnerUserAccess(db, {
    partnerId: E2E_PARTNER_ID,
    partnerName: E2E_PARTNER_NAME,
    userEmail: 'partner-events-manager@camera.local',
    userName: 'Partner Events Manager',
    userId: 'e2e-partner-events-manager',
    appKey: 'events',
    role: 'manager',
    isActive: true,
    createdBy: 'system:e2e',
  });

  const moderationEventId = `e2e-moderation-${Date.now()}`;
  const moderationEvent = await db.collection(COLLECTIONS.EVENTS).insertOne({
    eventId: moderationEventId,
    name: 'E2E Moderation Policy Event',
    description: 'E2E',
    partnerId: E2E_PARTNER_ID,
    partnerName: E2E_PARTNER_NAME,
    isActive: true,
    frames: [],
    logos: [],
    customPages: [],
    showLogo: false,
    tryOn: {
      enabled: true,
      allowedLeatherSuitIds: [],
      includeApprovedResultsInSlideshows: false,
      resultSlideshowMode: 'disabled',
    },
    createdBy: 'system:e2e',
    createdAt: now,
    updatedAt: now,
  });

  const sourceSubmissionId = new ObjectId();
  const resultSubmissionId = new ObjectId();
  await db.collection(COLLECTIONS.SUBMISSIONS).insertMany([
    {
      _id: sourceSubmissionId,
      submissionId: `e2e-source-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      userName: 'E2E User',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: moderationEventId,
      eventIds: [moderationEventId],
      eventName: 'E2E Moderation Policy Event',
      imageUrl: 'https://i.ibb.co/source.jpg',
      originalImageUrl: 'https://i.ibb.co/source.jpg',
      finalImageUrl: 'https://i.ibb.co/source.jpg',
      method: 'camera_capture',
      status: 'completed',
      consents: [],
      metadata: {
        deviceType: 'unknown',
        originalWidth: 1080,
        originalHeight: 1920,
        originalFileSize: 1000,
        originalMimeType: 'image/jpeg',
        finalWidth: 1080,
        finalHeight: 1920,
        finalFileSize: 1000,
        emailSent: false,
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      createdAt: now,
      updatedAt: now,
      submissionKind: 'original',
      tryOnJobs: [],
    },
    {
      _id: resultSubmissionId,
      submissionId: `e2e-result-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      userName: 'E2E User',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: moderationEventId,
      eventIds: [moderationEventId],
      eventName: 'E2E Moderation Policy Event',
      imageUrl: 'https://i.ibb.co/result.jpg',
      originalImageUrl: 'https://i.ibb.co/source.jpg',
      finalImageUrl: 'https://i.ibb.co/result.jpg',
      method: 'camera_capture',
      status: 'completed',
      consents: [],
      metadata: {
        deviceType: 'unknown',
        originalWidth: 1080,
        originalHeight: 1920,
        originalFileSize: 1000,
        originalMimeType: 'image/jpeg',
        finalWidth: 1080,
        finalHeight: 1920,
        finalFileSize: 1000,
        emailSent: false,
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      createdAt: now,
      updatedAt: now,
      submissionKind: 'tryon_result',
      sourceSubmissionId: sourceSubmissionId.toString(),
      sourceJobId: `e2e-job-${Date.now()}`,
      tryOnLeatherSuitId: 'e2e-suit',
      reviewStatus: 'pending_review',
      isShareVisible: false,
      isSlideshowEligible: false,
      tryOnModerationArchive: {
        archived: false,
        bucket: null,
        archivedAt: null,
        archivedBy: null,
      },
    },
  ]);

  const playlistEventId = `e2e-playlist-${Date.now()}`;
  await db.collection(COLLECTIONS.EVENTS).insertOne({
    eventId: playlistEventId,
    name: 'E2E Playlist Policy Event',
    description: 'E2E',
    partnerId: E2E_PARTNER_ID,
    partnerName: E2E_PARTNER_NAME,
    isActive: true,
    frames: [],
    logos: [],
    customPages: [],
    showLogo: false,
    tryOn: {
      enabled: true,
      allowedLeatherSuitIds: [],
      includeApprovedResultsInSlideshows: true,
      resultSlideshowMode: 'approved_results_only',
    },
    createdBy: 'system:e2e',
    createdAt: now,
    updatedAt: now,
  });

  const playlistSlideshowId = `e2e-slideshow-${Date.now()}`;
  await db.collection(COLLECTIONS.SLIDESHOWS).insertOne({
    slideshowId: playlistSlideshowId,
    eventId: playlistEventId,
    eventName: 'E2E Playlist Policy Event',
    name: 'E2E Slideshow',
    isActive: true,
    transitionDurationMs: 5000,
    fadeDurationMs: 1000,
    bufferSize: 5,
    refreshStrategy: 'continuous',
    playMode: 'loop',
    orderMode: 'fixed',
    submissionSourceMode: 'originals_only',
    createdBy: 'system:e2e',
    createdAt: now,
    updatedAt: now,
  });

  const playlistOriginalId = new ObjectId();
  const playlistApprovedId = new ObjectId();
  await db.collection(COLLECTIONS.SUBMISSIONS).insertMany([
    {
      _id: playlistOriginalId,
      submissionId: `e2e-playlist-original-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: playlistEventId,
      eventIds: [playlistEventId],
      eventName: 'E2E Playlist Policy Event',
      imageUrl: 'https://i.ibb.co/original.jpg',
      originalImageUrl: 'https://i.ibb.co/original.jpg',
      finalImageUrl: 'https://i.ibb.co/original.jpg',
      method: 'camera_capture',
      status: 'completed',
      consents: [],
      metadata: {
        deviceType: 'unknown',
        originalWidth: 1080,
        originalHeight: 1080,
        originalFileSize: 1000,
        originalMimeType: 'image/jpeg',
        finalWidth: 1080,
        finalHeight: 1080,
        finalFileSize: 1000,
        emailSent: false,
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      createdAt: now,
      updatedAt: now,
      submissionKind: 'original',
    },
    {
      _id: playlistApprovedId,
      submissionId: `e2e-playlist-approved-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: playlistEventId,
      eventIds: [playlistEventId],
      eventName: 'E2E Playlist Policy Event',
      imageUrl: 'https://i.ibb.co/approved.jpg',
      originalImageUrl: 'https://i.ibb.co/original.jpg',
      finalImageUrl: 'https://i.ibb.co/approved.jpg',
      method: 'camera_capture',
      status: 'completed',
      consents: [],
      metadata: {
        deviceType: 'unknown',
        originalWidth: 1080,
        originalHeight: 1080,
        originalFileSize: 1000,
        originalMimeType: 'image/jpeg',
        finalWidth: 1080,
        finalHeight: 1080,
        finalFileSize: 1000,
        emailSent: false,
      },
      shareCount: 0,
      downloadCount: 0,
      isArchived: false,
      hiddenFromPartner: false,
      hiddenFromEvents: [],
      createdAt: now,
      updatedAt: now,
      submissionKind: 'tryon_result',
      reviewStatus: 'approved',
      isShareVisible: true,
      isSlideshowEligible: true,
    },
  ]);

  return NextResponse.json({
    ok: true,
    partnerMongoId: partner?._id?.toString?.() ?? null,
    partnerId: E2E_PARTNER_ID,
    eventMongoId: event?._id?.toString?.() ?? null,
    eventId: E2E_EVENT_ID,
    moderationEventMongoId: moderationEvent.insertedId.toString(),
    moderationEventId,
    moderationResultSubmissionMongoId: resultSubmissionId.toString(),
    playlistEventId,
    playlistSlideshowId,
    playlistOriginalSubmissionMongoId: playlistOriginalId.toString(),
    playlistApprovedSubmissionMongoId: playlistApprovedId.toString(),
  });
}
