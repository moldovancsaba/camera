/**
 * The one switch of the counters for messmass (issue 521, phase 1; owner decision 245 and CLAUDE.md section 8): **off unless it was switched on**, kept in `admin_settings`
 * (`settingId: 'messmass-counters'`). While it is off, camera computes nothing for messmass and sends nothing; the first real push is the owner's decision, made when a real event can be
 * watched. Only a stored `true` is on: a missing document, a missing field, `"true"` as text or anything else is off. Unit-tested in counters-setting.test.ts.
 *
 * It is changed through PATCH /api/admin/settings/messmass-counters (global admins), from the button on the Messmass tab of the Analytics (components/admin/analytics/CountersSwitch.tsx), which asks
 * before switching on. The switch pushes nothing itself: a push is asked for after a submission, vetting decision, or Journey batch (lib/analytics/counters-trigger.ts).
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export const COUNTERS_SETTING_ID = 'messmass-counters';

export interface CountersSetting {
  settingId: typeof COUNTERS_SETTING_ID;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_COUNTERS_SETTING: CountersSetting = { settingId: COUNTERS_SETTING_ID, enabled: false, updatedAt: '', updatedBy: null };

export async function getCountersSetting(db: Db): Promise<CountersSetting> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: COUNTERS_SETTING_ID });
  if (!stored) return DEFAULT_COUNTERS_SETTING;
  return {
    settingId: COUNTERS_SETTING_ID,
    enabled: stored.enabled === true,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
  };
}

export async function setCountersSetting(db: Db, enabled: boolean, by: string | null, now: Date = new Date()): Promise<CountersSetting> {
  const next: CountersSetting = { settingId: COUNTERS_SETTING_ID, enabled, updatedAt: now.toISOString(), updatedBy: by };
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: COUNTERS_SETTING_ID }, { $set: next }, { upsert: true });
  return next;
}
