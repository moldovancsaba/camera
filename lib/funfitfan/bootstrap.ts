/**
 * Ensures FunFitFan partner, optional settings row, and per-user virtual Event + Slideshow.
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import {
  COLLECTIONS,
  generateId,
  generateTimestamp,
  type FffUserProfile,
} from '@/lib/db/schemas';
import { inheritPartnerDefaults } from '@/lib/db/events';
import {
  FUNFITFAN_PARTNER_ID,
  FUNFITFAN_PARTNER_NAME,
  FFF_SETTINGS_KEY,
  FFF_SLIDESHOW_FADE_MS,
  FFF_SLIDESHOW_TRANSITION_MS,
} from '@/lib/funfitfan/constants';

export class FffBootstrapError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'FffBootstrapError';
  }
}

async function ensureFunFitFanPartner(db: Db, createdByUserId: string): Promise<void> {
  const col = db.collection(COLLECTIONS.PARTNERS);
  const existing = await col.findOne({ partnerId: FUNFITFAN_PARTNER_ID });
  if (existing) return;

  const now = generateTimestamp();
  await col.insertOne({
    partnerId: FUNFITFAN_PARTNER_ID,
    name: FUNFITFAN_PARTNER_NAME,
    description: 'FunFitFan — personal activity reel (virtual event per member)',
    isActive: true,
    defaultFrames: [],
    createdBy: createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getFffDefaultFrameId(db: Db): Promise<string | null> {
  const row = await db.collection(COLLECTIONS.FFF_SETTINGS).findOne({ settingsKey: FFF_SETTINGS_KEY });
  const id = row?.defaultFrameId;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

/**
 * Idempotent: creates partner (if missing), personal event + slideshow + profile for this user.
 */
export async function ensureFunFitFanUserContext(
  db: Db,
  session: Session
): Promise<{
  eventMongoId: string;
  eventUuid: string;
  eventName: string;
  slideshowId: string;
  partnerId: string;
  partnerName: string;
  defaultFrameId: string | null;
  frame: {
    frameId: string;
    name: string;
    fileUrl: string;
    width: number;
    height: number;
  } | null;
}> {
  await ensureFunFitFanPartner(db, session.user.id);

  const defaultFrameId = await getFffDefaultFrameId(db);
  if (!defaultFrameId) {
    throw new FffBootstrapError(
      'FunFitFan is not ready yet: an admin must choose the default frame in Admin → Gym → FunFitFan.',
      503
    );
  }

  const frame = await db.collection(COLLECTIONS.FRAMES).findOne({
    frameId: defaultFrameId,
    isActive: true,
  });
  if (!frame) {
    throw new FffBootstrapError('Configured FunFitFan frame was not found or is inactive.', 503);
  }

  const syncNow = generateTimestamp();
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: FUNFITFAN_PARTNER_ID },
    { $set: { defaultFrames: [defaultFrameId], updatedAt: syncNow } }
  );

  const profiles = db.collection<FffUserProfile>(COLLECTIONS.FFF_USER_PROFILES);
  const existingProfile = await profiles.findOne({ userId: session.user.id });
  if (existingProfile) {
    const ev = await db
      .collection(COLLECTIONS.EVENTS)
      .findOne({ _id: new ObjectId(existingProfile.eventMongoId) });
    if (ev && existingProfile.slideshowId) {
      return {
        eventMongoId: existingProfile.eventMongoId,
        eventUuid: existingProfile.eventUuid,
        eventName: (ev as { name?: string }).name || 'FunFitFan',
        slideshowId: existingProfile.slideshowId,
        partnerId: FUNFITFAN_PARTNER_ID,
        partnerName: FUNFITFAN_PARTNER_NAME,
        defaultFrameId,
        frame: {
          frameId: frame.frameId as string,
          name: frame.name as string,
          fileUrl: frame.fileUrl as string,
          width: frame.width as number,
          height: frame.height as number,
        },
      };
    }
  }

  const inherited = await inheritPartnerDefaults(FUNFITFAN_PARTNER_ID);
  const now = generateTimestamp();
  const eventUuid = generateId();
  const display = session.user.name || session.user.email;
  const eventDoc = {
    eventId: eventUuid,
    name: `${display}'s FunFitFan`,
    description: 'Your personal activity reel',
    partnerId: FUNFITFAN_PARTNER_ID,
    partnerName: FUNFITFAN_PARTNER_NAME,
    isActive: true,
    showLogo: false,
    customPages: [],
    submissionCount: 0,
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
    ...inherited,
  };

  const eventInsert = await db.collection(COLLECTIONS.EVENTS).insertOne(eventDoc);
  const eventMongoId = eventInsert.insertedId.toString();

  const slideshowId = generateId();
  const slideshow = {
    slideshowId,
    eventId: eventUuid,
    eventName: eventDoc.name,
    name: 'My reel',
    isActive: true,
    transitionDurationMs: FFF_SLIDESHOW_TRANSITION_MS,
    fadeDurationMs: FFF_SLIDESHOW_FADE_MS,
    bufferSize: 10,
    refreshStrategy: 'continuous' as const,
    playMode: 'loop' as const,
    orderMode: 'fixed' as const,
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(COLLECTIONS.SLIDESHOWS).insertOne(slideshow);

  const profile: FffUserProfile = {
    userId: session.user.id,
    userEmail: session.user.email,
    eventMongoId,
    eventUuid,
    slideshowId,
    createdAt: now,
    updatedAt: now,
  };
  await profiles.insertOne(profile);

  return {
    eventMongoId,
    eventUuid,
    eventName: eventDoc.name,
    slideshowId,
    partnerId: FUNFITFAN_PARTNER_ID,
    partnerName: FUNFITFAN_PARTNER_NAME,
    defaultFrameId,
    frame: {
      frameId: frame.frameId as string,
      name: frame.name as string,
      fileUrl: frame.fileUrl as string,
      width: frame.width as number,
      height: frame.height as number,
    },
  };
}
