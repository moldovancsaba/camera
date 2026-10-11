/**
 * The kill switch of the journey recording (issue 521, phase 2; owner decision 241): one global setting in `admin_settings` (`settingId: 'journey-recording'`). **On unless it was switched
 * off**: only a stored `enabled: false` turns the recording off; a missing document, a missing field or a read that fails leaves it on (a recording that stops because of a database
 * hiccup would lose the match without anybody having decided that). While it is off:
 *
 * - the guest event answer carries `journeyRecording: false`, so the capture page starts nothing and sends no beacon at all (app/api/events/[eventId]/route.ts), and
 * - the endpoint answers 204 without writing, for the pages that were opened before the switch (app/api/observability/journey/route.ts).
 *
 * The owner switches it from the Journey tab of the Analytics view (global admins), without a deploy. The value is kept in memory for `JOURNEY_SETTING_TTL_MS` per server instance, so the
 * guest event answer and a flood of beacons cost no database read each; a switch therefore takes effect everywhere within that time (and at once on the instance that handled the switch).
 * Server side; unit-tested in setting.test.ts.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export const JOURNEY_SETTING_ID = 'journey-recording';
export const JOURNEY_SETTING_TTL_MS = 30_000;

export interface JourneySetting {
  settingId: typeof JOURNEY_SETTING_ID;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_JOURNEY_SETTING: JourneySetting = { settingId: JOURNEY_SETTING_ID, enabled: true, updatedAt: '', updatedBy: null };

export async function getJourneySetting(db: Db): Promise<JourneySetting> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: JOURNEY_SETTING_ID });
  if (!stored) return DEFAULT_JOURNEY_SETTING;
  return {
    settingId: JOURNEY_SETTING_ID,
    enabled: stored.enabled !== false,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
  };
}

let cached: { enabled: boolean; at: number } | null = null;

/** Forgets the kept value (a test, or a switch just made on this instance). */
export function resetJourneySettingCache(): void {
  cached = null;
}

/** Whether the recording is on: the setting, kept in memory for `JOURNEY_SETTING_TTL_MS`. Never throws; a failed read answers "on" and is not kept. */
export async function journeyRecordingEnabled(db: Db, now: number = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < JOURNEY_SETTING_TTL_MS) return cached.enabled;
  try {
    const setting = await getJourneySetting(db);
    cached = { enabled: setting.enabled, at: now };
    return setting.enabled;
  } catch {
    return true;
  }
}

export async function setJourneySetting(db: Db, enabled: boolean, by: string | null, now: Date = new Date()): Promise<JourneySetting> {
  const next: JourneySetting = { settingId: JOURNEY_SETTING_ID, enabled, updatedAt: now.toISOString(), updatedBy: by };
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: JOURNEY_SETTING_ID }, { $set: next }, { upsert: true });
  cached = { enabled, at: now.getTime() };
  return next;
}
