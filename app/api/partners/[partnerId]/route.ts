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
import { partnerLibraryIds } from '@/lib/library/db';
import { parsePartnerBrandDefaults } from '@/lib/events/brand-colours';
import { UI_LANGUAGES, isUiLanguage } from '@/lib/i18n';
import { parseCameraMode } from '@/lib/camera/mode';
import { parseGalleryConsent } from '@/lib/events/gallery-consent';
import { parseLogoDefaults, type LogoDefault } from '@/lib/library/logos';

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
    uiLanguage,
    cameraMode,
    galleryConsent,
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
  // The language of the partner's events that did not set their own: they follow it (issue 353). Empty takes it away (English).
  if (uiLanguage !== undefined) {
    if (uiLanguage === null || uiLanguage === '') updates.uiLanguage = null;
    else if (isUiLanguage(uiLanguage)) updates.uiLanguage = uiLanguage;
    else throw apiBadRequest('uiLanguage must be one of: ' + UI_LANGUAGES.join(', '));
  }
  // How the partner's events that made no choice take the photo (issue 547): the phone's own camera app or the live camera with the view buttons. Empty takes it away (the standard).
  if (cameraMode !== undefined) {
    const parsed = parseCameraMode(cameraMode);
    if (!parsed.ok) throw apiBadRequest(parsed.error);
    updates.cameraMode = parsed.value;
  }
  // Whether the partner's events that made no choice ask for the user's own permission to show a photo in the public gallery (issue 554). Empty takes it away (they do not ask).
  if (galleryConsent !== undefined) {
    const parsed = parseGalleryConsent(galleryConsent);
    if (!parsed.ok) throw apiBadRequest(parsed.error);
    updates.galleryConsent = parsed.value;
  }
  // The default colours of the partner's events (camera#380): by default none, so the events follow messmass; only a colour somebody picked is stored.
  let brandDefaults: ReturnType<typeof parsePartnerBrandDefaults> | undefined;
  if (defaultBrandColors !== undefined) {
    brandDefaults = parsePartnerBrandDefaults(defaultBrandColors);
    if (!brandDefaults.ok) throw apiBadRequest(brandDefaults.error);
    updates.defaultBrandColors = brandDefaults.value;
  }
  if (defaultFrames !== undefined) updates.defaultFrames = defaultFrames;

  const db = await connectToDatabase();
  const existingPartner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!existingPartner) {
    throw apiNotFound('Partner');
  }

  // A default frame for new events is always an item of the partner's own library (camera#361): the library page sets it.
  if (defaultFrames !== undefined) {
    if (!Array.isArray(defaultFrames) || defaultFrames.some((id) => typeof id !== 'string')) {
      throw apiBadRequest('defaultFrames must be a list of frame ids');
    }
    const inLibrary = await partnerLibraryIds(db, existingPartner, 'frames');
    const outside = (defaultFrames as string[]).filter((id) => !inLibrary.has(id));
    if (outside.length > 0) {
      throw apiBadRequest(`A default frame must be in the partner library: ${outside.join(', ')}`);
    }
  }

  // The same for a default logo (camera#367): an item of the partner's library, with a known scenario and an order.
  let logoDefaults: LogoDefault[] | undefined;
  if (defaultLogos !== undefined) {
    const parsed = parseLogoDefaults(defaultLogos);
    if (!parsed.ok) {
      throw apiBadRequest(parsed.reason);
    }
    const inLibrary = await partnerLibraryIds(db, existingPartner, 'logos');
    const outside = [...new Set(parsed.rows.map((row) => row.logoId))].filter((id) => !inLibrary.has(id));
    if (outside.length > 0) {
      throw apiBadRequest(`A default logo must be in the partner library: ${outside.join(', ')}`);
    }
    logoDefaults = parsed.rows;
    updates.defaultLogos = logoDefaults;
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
    if (brandDefaults?.ok) cascadeUpdates.defaultBrandColors = brandDefaults.value;
    if (defaultFrames !== undefined) cascadeUpdates.defaultFrames = defaultFrames;
    if (logoDefaults !== undefined) cascadeUpdates.defaultLogos = logoDefaults;
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
