/**
 * The one global switch of the journey defaults (planning item 26, camera#330): defaults, such as the default consent page, are added to the events
 * created from now on (`journeyDefaults: true`) and to existing events only when this switch is on, so the moment they reach events that are running
 * is chosen deliberately. Nothing an event has already set is ever deleted.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export interface DefaultsRolloutSettings {
  settingId: 'defaults-rollout';
  applyToExistingEvents: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_DEFAULTS_ROLLOUT: DefaultsRolloutSettings = { settingId: 'defaults-rollout', applyToExistingEvents: false, updatedAt: '', updatedBy: null };

export async function getDefaultsRollout(db: Db): Promise<DefaultsRolloutSettings> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'defaults-rollout' });
  if (!stored) return DEFAULT_DEFAULTS_ROLLOUT;
  return {
    settingId: 'defaults-rollout',
    applyToExistingEvents: stored.applyToExistingEvents === true,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
  };
}

/** True for an event created with the defaults, or for any event once the switch is on. */
export function eventGetsDefaults(event: { journeyDefaults?: unknown }, rollout: { applyToExistingEvents: boolean }): boolean {
  return event.journeyDefaults === true || rollout.applyToExistingEvents === true;
}
