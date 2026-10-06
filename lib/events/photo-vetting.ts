/**
 * Photo vetting for an event (camera#263, docs/PHOTO_VETTING_PLAN.md): with it required, a guest's photo is saved as pending, no
 * branded image of it exists, and it reaches the share page, slideshows and feeds only after an event manager or admin approves.
 *
 * `event.photoVetting.required` is the switch. Only a global admin changes it. Until the rollout (V10) the default for new events
 * is OFF, so merging the packages before it changes nothing; the rollout flips `PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS` and runs the
 * backfill for the existing events (a dry run first).
 */

/** Whether a new event starts with vetting required. Switched on by the rollout (camera#271). */
export const PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS = false;

export interface PhotoVettingSetting {
  required: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}

/** The setting a new event is created with. */
export function defaultPhotoVetting(now: string = new Date().toISOString()): PhotoVettingSetting {
  return { required: PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS, updatedAt: now, updatedBy: null };
}

/** True only when the event explicitly requires vetting; a missing setting is "not required" (events made before it existed). */
export function photoVettingRequired(event: { photoVetting?: { required?: unknown } | null } | null | undefined): boolean {
  return event?.photoVetting?.required === true;
}

/** What a PATCH may set: a boolean `required`, nothing else. Null when the input is not a valid setting. */
export function normalizePhotoVettingInput(input: unknown, actorEmail: string | null, now: string = new Date().toISOString()): PhotoVettingSetting | null {
  if (!input || typeof input !== 'object') return null;
  const required = (input as { required?: unknown }).required;
  return typeof required === 'boolean' ? { required, updatedAt: now, updatedBy: actorEmail } : null;
}
