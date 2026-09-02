import type { Db } from 'mongodb';
import { COLLECTIONS, type AdminCardDisplaySettings } from '@/lib/db/schemas';

export const DEFAULT_CARD_DISPLAY_SETTINGS: Omit<AdminCardDisplaySettings, '_id'> = {
  settingId: 'card-display',
  metadata: {
    email: true,
    eventPartner: true,
    garmentName: true,
  },
  status: {
    reviewBadge: true,
    greatBadge: true,
    visibilityLabel: true,
    assetHealth: true,
  },
  actions: {
    approveReject: true,
    great: true,
    service: true,
    view: true,
    download: true,
    fix: true,
    remove: true,
    rerunControls: true,
    pinToSlideshow: true,
  },
  updatedAt: '',
  updatedBy: null,
};

export async function getCardDisplaySettings(db: Db): Promise<Omit<AdminCardDisplaySettings, '_id'>> {
  const stored = await db
    .collection<AdminCardDisplaySettings>(COLLECTIONS.ADMIN_SETTINGS)
    .findOne({ settingId: 'card-display' });
  if (!stored) {
    return DEFAULT_CARD_DISPLAY_SETTINGS;
  }
  // Merge over defaults so a field added after a saved document exists still
  // has a value (new toggle ships "on" for everyone) instead of undefined.
  return {
    settingId: 'card-display',
    metadata: { ...DEFAULT_CARD_DISPLAY_SETTINGS.metadata, ...stored.metadata },
    status: { ...DEFAULT_CARD_DISPLAY_SETTINGS.status, ...stored.status },
    actions: { ...DEFAULT_CARD_DISPLAY_SETTINGS.actions, ...stored.actions },
    updatedAt: stored.updatedAt ?? '',
    updatedBy: stored.updatedBy ?? null,
  };
}
