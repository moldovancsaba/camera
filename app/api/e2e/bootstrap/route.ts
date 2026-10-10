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

  const exportEventId = `e2e-export-${Date.now()}`;
  const exportEvent = await db.collection(COLLECTIONS.EVENTS).insertOne({
    eventId: exportEventId,
    name: 'E2E Export Event',
    description: 'E2E',
    partnerId: E2E_PARTNER_ID,
    partnerName: E2E_PARTNER_NAME,
    isActive: true,
    frames: [],
    logos: [],
    customPages: [],
    showLogo: false,
    metadata: {
      source: e2eSource,
      e2eRunId,
    },
    createdBy: 'system:e2e',
    createdAt: now,
    updatedAt: now,
  });

  const firstSubmissionId = new ObjectId();
  const secondSubmissionId = new ObjectId();

  await db.collection(COLLECTIONS.SUBMISSIONS).insertMany([
    {
      _id: firstSubmissionId,
      submissionId: `e2e-first-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      userName: 'E2E User',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: exportEventId,
      eventIds: [exportEventId],
      eventName: 'E2E Export Event',
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
    },
    {
      _id: secondSubmissionId,
      submissionId: `e2e-second-${Date.now()}`,
      userId: 'e2e-user',
      userEmail: 'e2e-user@camera.local',
      userName: 'E2E User',
      frameId: 'none',
      partnerId: E2E_PARTNER_ID,
      partnerName: E2E_PARTNER_NAME,
      eventId: exportEventId,
      eventIds: [exportEventId],
      eventName: 'E2E Export Event',
      imageUrl: 'https://i.ibb.co/second.jpg',
      originalImageUrl: 'https://i.ibb.co/second.jpg',
      finalImageUrl: 'https://i.ibb.co/second.jpg',
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
      submissionKind: 'original',
      reviewStatus: 'approved',
    },
  ]);

  return NextResponse.json({
    ok: true,
    partnerMongoId: partner?._id?.toString?.() ?? null,
    partnerId: E2E_PARTNER_ID,
    eventMongoId: event?._id?.toString?.() ?? null,
    eventId: E2E_EVENT_ID,
    exportEventMongoId: exportEvent.insertedId.toString(),
    exportEventId,
    e2eRunId,
  });
}
