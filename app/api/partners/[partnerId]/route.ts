/**
 * Partner API - Individual Operations
 *
 * GET: Get single partner details (global admin or assigned partner workspace)
 * PATCH: Update partner (global admin only)
 * DELETE: Delete partner (global admin only)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { updateChildEventsFromPartner } from '@/lib/db/events';
import {
  withErrorHandler,
  requireAuth,
  requireAdmin,
  apiSuccess,
  apiBadRequest,
  apiError,
  apiNotFound,
} from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { pushPartnerToMessmass } from '@/lib/messmassClient';

export const GET = withErrorHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ partnerId: string }> }
) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner, eventCount, frameCount } = await loadPartnerWithStats(db, session, partnerId);

  return apiSuccess({
    partner: {
      ...partner,
      eventCount,
      frameCount,
    },
  });
});

async function loadPartnerWithStats(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  session: Awaited<ReturnType<typeof requireAuth>>,
  partnerMongoId: string
) {
  const { partner, partnerId } = await assertPartnerMongoWorkspaceAccess(db, session, partnerMongoId, 'viewer');

  const eventCount = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId });
  // Frames carry no partnerId (v12.2.15 finding) -- assignment lives on the
  // event, so the truthful count is distinct frames assigned to this
  // partner's events.
  const frameCountResult = (await db
    .collection(COLLECTIONS.EVENTS)
    .aggregate([
      { $match: { partnerId } },
      { $unwind: '$frames' },
      { $group: { _id: '$frames.frameId' } },
      { $count: 'count' },
    ])
    .toArray()) as Array<{ count: number }>;
  const frameCount = frameCountResult[0]?.count ?? 0;

  return { partner, partnerId, eventCount, frameCount };
}

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ partnerId: string }> }
) => {
  await requireAdmin();
  const { partnerId } = await context.params;

  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID');
  }

  const body = await request.json();
  const {
    name,
    description,
    contactEmail,
    contactName,
    logoUrl,
    isActive,
    defaultBrandColors,
    defaultFrames,
    defaultLogos,
  } = body;

  const updates: Record<string, unknown> = {
    updatedAt: generateTimestamp(),
  };

  if (name !== undefined) {
    if (String(name).trim() === '') {
      throw apiBadRequest('Partner name cannot be empty');
    }
    updates.name = String(name).trim();
  }
  if (description !== undefined) updates.description = description?.trim() || null;
  if (contactEmail !== undefined) updates.contactEmail = contactEmail?.trim() || null;
  if (contactName !== undefined) updates.contactName = contactName?.trim() || null;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl?.trim() || null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (defaultBrandColors !== undefined) updates.defaultBrandColors = defaultBrandColors;
  if (defaultFrames !== undefined) updates.defaultFrames = defaultFrames;
  if (defaultLogos !== undefined) updates.defaultLogos = defaultLogos;

  const db = await connectToDatabase();
  const existingPartner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!existingPartner) {
    throw apiNotFound('Partner');
  }

  const result = await db.collection(COLLECTIONS.PARTNERS).findOneAndUpdate(
    { _id: new ObjectId(partnerId) },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw apiNotFound('Partner');
  }

  // WHAT: Push updates to messmass for camera-native partners only.
  // WHY: A partner with source === 'messmass' originated FROM messmass -- pushing
  //   it back would be a no-op round-trip at best and a stale-data overwrite at
  //   worst. Only genuinely camera-native partners (created here, or previously
  //   linked from here) get their edits propagated onward.
  if (existingPartner.source !== 'messmass') {
    try {
      const pushed = await pushPartnerToMessmass({
        cameraPartnerId: result.partnerId,
        name: result.name,
        logoUrl: result.logoUrl,
      });
      if (pushed && !result.messmassPartnerId) {
        await db.collection(COLLECTIONS.PARTNERS).updateOne(
          { _id: result._id },
          { $set: { messmassPartnerId: pushed.id } }
        );
        result.messmassPartnerId = pushed.id;
      }
    } catch {
      // non-fatal
    }
  }

  let cascadeResult;
  if (defaultBrandColors !== undefined || defaultFrames !== undefined || defaultLogos !== undefined) {
    const cascadeUpdates: Record<string, unknown> = {};
    if (defaultBrandColors !== undefined) cascadeUpdates.defaultBrandColors = defaultBrandColors;
    if (defaultFrames !== undefined) cascadeUpdates.defaultFrames = defaultFrames;
    if (defaultLogos !== undefined) cascadeUpdates.defaultLogos = defaultLogos;
    cascadeResult = await updateChildEventsFromPartner(existingPartner.partnerId, cascadeUpdates);
  }

  return apiSuccess({
    partner: result,
    cascade: cascadeResult,
  });
});

export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ partnerId: string }> }
) => {
  await requireAdmin();
  const { partnerId } = await context.params;

  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID');
  }

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }

  const eventCount = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: partner.partnerId });
  if (eventCount > 0) {
    throw apiError('Cannot delete partner with existing events', 409, { eventCount });
  }

  await db.collection(COLLECTIONS.PARTNERS).deleteOne({ _id: new ObjectId(partnerId) });

  return apiSuccess({ message: 'Partner deleted successfully' });
});
