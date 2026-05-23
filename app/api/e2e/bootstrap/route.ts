import { NextResponse } from 'next/server';
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

  return NextResponse.json({
    ok: true,
    partnerMongoId: partner?._id?.toString?.() ?? null,
    partnerId: E2E_PARTNER_ID,
    eventMongoId: event?._id?.toString?.() ?? null,
    eventId: E2E_EVENT_ID,
  });
}
