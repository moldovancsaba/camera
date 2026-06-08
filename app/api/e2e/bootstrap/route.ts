import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';
import { upsertPartnerUserAccess } from '@/lib/partners/access';
import { assertDisposableE2EDatabase, buildE2ERunId } from '@/lib/e2e/safety';

const E2E_PARTNER_ID = 'e2e-partner';
const E2E_PARTNER_NAME = 'E2E Partner';
const E2E_EVENT_ID = 'e2e-event';
const E2E_EVENT_NAME = 'E2E Event Instance';

export async function POST(request: Request) {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local');
  if (!isLocalHost && process.env.ALLOW_DANGEROUS_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    assertDisposableE2EDatabase('E2E bootstrap');
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const db = await connectToDatabase();
  const now = generateTimestamp();
  const e2eRunId = buildE2ERunId();
  const e2eSource = 'system:e2e-bootstrap';

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
      metadata: {
        source: e2eSource,
        e2eRunId,
      },
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
      metadata: {
        source: e2eSource,
        e2eRunId,
      },
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
  await upsertPartnerUserAccess(db, {
    partnerId: E2E_PARTNER_ID,
    partnerName: E2E_PARTNER_NAME,
    userEmail: 'partner-events-viewer@camera.local',
    userName: 'Partner Events Viewer',
    userId: 'e2e-partner-events-viewer',
    appKey: 'events',
    role: 'viewer',
    isActive: true,
    createdBy: 'system:e2e',
  });
  await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).updateMany(
    {
      partnerId: E2E_PARTNER_ID,
      userEmail: {
        $in: ['partner-events-manager@camera.local', 'partner-events-viewer@camera.local'],
      },
      appKey: 'events',
    },
    {
      $set: {
        metadata: {
          source: e2eSource,
          e2eRunId,
        },
      },
    }
  );

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
    metadata: {
      source: e2eSource,
      e2eRunId,
    },
    createdBy: 'system:e2e',
    createdAt: now,
    updatedAt: now,
  });

  const sourceSubmissionId = new ObjectId();
  const resultSubmissionId = new ObjectId();
  const moderationJobId = `e2e-job-${Date.now()}`;
  const moderationSetupId = 'e2e-default-setup';

  await db.collection(COLLECTIONS.TRYON_SETUPS).updateOne(
    { setupId: moderationSetupId },
    {
      $set: {
        setupId: moderationSetupId,
        name: 'E2E Default Setup',
        description: 'E2E rerun lifecycle setup',
        active: true,
        isDefault: true,
        rank: 0,
        config: { processing_profile: 'default' },
        metadata: { source: e2eSource, e2eRunId },
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  await db.collection(COLLECTIONS.TRYON_JOBS).insertOne({
    jobId: moderationJobId,
    requestHash: `e2e-hash-${moderationJobId}`,
    status: 'done',
    stage: 'done',
    pipeline: 'motogp_leather_magic',
    pipelineVersion: 'e2e',
    source: {
      app: 'camera',
      submissionId: sourceSubmissionId.toString(),
      imageUrl: 'https://i.ibb.co/source.jpg',
      eventId: moderationEventId,
      partnerId: E2E_PARTNER_ID,
      userId: 'e2e-user',
    },
    request: {
      leatherSuitId: 'e2e-suit',
      setupId: moderationSetupId,
    },
    processing: {
      attemptCount: 1,
      nextAttemptAt: now,
      workerId: 'e2e-worker',
      finishedAt: now,
      resolvedSetup: {
        setupId: moderationSetupId,
        setupName: 'E2E Default Setup',
        setupProfile: 'default',
        setupSource: 'global.default',
      },
    },
    result: {
      publicResultUrl: 'https://i.ibb.co/result.jpg',
      imgbbDeleteUrl: null,
      provider: 'imgbb',
    },
    error: {
      code: null,
      message: null,
      details: null,
    },
    createdAt: now,
    updatedAt: now,
  });

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
        source: e2eSource,
        e2eRunId,
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
        e2eRunId,
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
      sourceJobId: moderationJobId,
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
    metadata: {
      source: e2eSource,
      e2eRunId,
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
    metadata: {
      source: e2eSource,
      e2eRunId,
    },
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
        e2eRunId,
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
        e2eRunId,
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
    moderationSourceJobId: moderationJobId,
    moderationSetupId,
    e2eRunId,
    playlistEventId,
    playlistSlideshowId,
    playlistOriginalSubmissionMongoId: playlistOriginalId.toString(),
    playlistApprovedSubmissionMongoId: playlistApprovedId.toString(),
  });
}
