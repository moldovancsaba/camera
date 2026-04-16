/**
 * Admin: FunFitFan default frame (drives partner.defaultFrames + child event inheritance).
 */

import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { updateChildEventsFromPartner } from '@/lib/db/events';
import {
  withErrorHandler,
  requireAdmin,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';
import {
  FUNFITFAN_PARTNER_ID,
  FUNFITFAN_PARTNER_NAME,
  FFF_SETTINGS_KEY,
} from '@/lib/funfitfan/constants';
import { readFunFitFanDefaultFrameId, readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { normalizeSportActivitiesList } from '@/lib/funfitfan/sport-activities';

async function ensurePartnerRow(db: Db, adminUserId: string) {
  const col = db.collection(COLLECTIONS.PARTNERS);
  const existing = await col.findOne({ partnerId: FUNFITFAN_PARTNER_ID });
  if (existing) return;
  const now = generateTimestamp();
  await col.insertOne({
    partnerId: FUNFITFAN_PARTNER_ID,
    name: FUNFITFAN_PARTNER_NAME,
    description: 'FunFitFan — personal activity reel',
    isActive: true,
    defaultFrames: [],
    createdBy: adminUserId,
    createdAt: now,
    updatedAt: now,
  });
}

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  const settings = await db.collection(COLLECTIONS.FFF_SETTINGS).findOne({ settingsKey: FFF_SETTINGS_KEY });
  const effectiveId = (await readFunFitFanDefaultFrameId(db)) ?? '';
  const sportActivities = await readFunFitFanSportActivities(db);
  return apiSuccess({
    defaultFrameId: effectiveId,
    sportActivities,
    updatedAt: settings?.updatedAt ?? null,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = await request.json();
  const defaultFrameId = typeof body.defaultFrameId === 'string' ? body.defaultFrameId.trim() : '';
  const hasActivities = 'sportActivities' in body;
  const sportActivities = hasActivities ? normalizeSportActivitiesList(body.sportActivities) : null;

  if (!defaultFrameId && !hasActivities) {
    throw apiBadRequest('Provide defaultFrameId and/or sportActivities');
  }
  if (hasActivities && (!sportActivities || sportActivities.length === 0)) {
    throw apiBadRequest('sportActivities must be a non-empty array of strings (max 20)');
  }

  const db = await connectToDatabase();
  await ensurePartnerRow(db, session.user.id);

  const now = generateTimestamp();
  const $set: Record<string, unknown> = {
    settingsKey: FFF_SETTINGS_KEY,
    updatedAt: now,
    updatedBy: session.user.id,
  };

  if (defaultFrameId) {
    let frame = await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: defaultFrameId, isActive: true });
    if (!frame) {
      frame = await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: defaultFrameId });
    }
    if (!frame) {
      throw apiNotFound('Frame');
    }
    $set.defaultFrameId = defaultFrameId;
  }

  if (sportActivities && sportActivities.length > 0) {
    $set.sportActivities = sportActivities;
  }

  await db.collection(COLLECTIONS.FFF_SETTINGS).updateOne(
    { settingsKey: FFF_SETTINGS_KEY },
    { $set: $set },
    { upsert: true }
  );

  if (defaultFrameId) {
    await db.collection(COLLECTIONS.PARTNERS).updateOne(
      { partnerId: FUNFITFAN_PARTNER_ID },
      { $set: { defaultFrames: [defaultFrameId], updatedAt: now } }
    );
    await updateChildEventsFromPartner(FUNFITFAN_PARTNER_ID, { defaultFrames: [defaultFrameId] });
  }

  const outFrameId = defaultFrameId || (await readFunFitFanDefaultFrameId(db)) || '';
  const outActivities = await readFunFitFanSportActivities(db);

  return apiSuccess({
    defaultFrameId: outFrameId,
    sportActivities: outActivities,
    updatedAt: now,
  });
});
