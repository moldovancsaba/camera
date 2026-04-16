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
  return apiSuccess({
    defaultFrameId: settings?.defaultFrameId ?? '',
    updatedAt: settings?.updatedAt ?? null,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = await request.json();
  const defaultFrameId = typeof body.defaultFrameId === 'string' ? body.defaultFrameId.trim() : '';
  if (!defaultFrameId) {
    throw apiBadRequest('defaultFrameId is required');
  }

  const db = await connectToDatabase();
  await ensurePartnerRow(db, session.user.id);

  const frame = await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: defaultFrameId, isActive: true });
  if (!frame) {
    throw apiNotFound('Frame');
  }

  const now = generateTimestamp();
  await db.collection(COLLECTIONS.FFF_SETTINGS).updateOne(
    { settingsKey: FFF_SETTINGS_KEY },
    {
      $set: {
        settingsKey: FFF_SETTINGS_KEY,
        defaultFrameId,
        updatedAt: now,
        updatedBy: session.user.id,
      },
    },
    { upsert: true }
  );

  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: FUNFITFAN_PARTNER_ID },
    { $set: { defaultFrames: [defaultFrameId], updatedAt: now } }
  );

  await updateChildEventsFromPartner(FUNFITFAN_PARTNER_ID, { defaultFrames: [defaultFrameId] });

  return apiSuccess({ defaultFrameId, updatedAt: now });
});
