/** Optional event-level screening of new pending photos. Missing is off; it never affects human vetting. */

export interface PhotoModerationPrecheckSetting {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}

export function photoModerationPrecheckEnabled(event: { photoModerationPrecheck?: { enabled?: unknown } | null } | null | undefined): boolean {
  return event?.photoModerationPrecheck?.enabled === true;
}

export function normalizePhotoModerationPrecheckInput(
  input: unknown,
  actorEmail: string | null,
  now: string = new Date().toISOString(),
): PhotoModerationPrecheckSetting | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const enabled = (input as { enabled?: unknown }).enabled;
  return typeof enabled === 'boolean' ? { enabled, updatedAt: now, updatedBy: actorEmail } : null;
}
