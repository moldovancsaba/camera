/**
 * What a user has accepted, kept in the browser tab for the few minutes a sign-in takes (issue 523). Signing in with Google or Facebook leaves the page and comes back to it
 * (lib/auth/capture-return.ts): the page's own state is gone, so the acceptances given before the sign-in would be gone too and the photo would be saved without them. They are written
 * to `sessionStorage` when they are given and read back only when the page is resumed after a sign-in; they are removed once the photo is saved or the flow starts over. Pure around
 * a storage object that is passed in, so it is unit-tested with a fake one (consent-memory.test.ts); a storage that is missing or throws means nothing is remembered.
 */

import type { ConsentRecord } from '@/lib/events/consent';

/** A sign-in takes seconds; a remembered acceptance older than this is not used (a user who left the page and comes back later accepts again). */
export const CONSENT_MEMORY_MAX_AGE_MS = 30 * 60 * 1000;

const key = (eventId: string) => `camera.consents.${eventId}`;

type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>;
type ReadStorage = Pick<Storage, 'getItem'>;

/** Keeps the acceptances (an empty list removes the memory). */
export function rememberConsents(storage: WriteStorage | null | undefined, eventId: string, consents: readonly ConsentRecord[], now: number = Date.now()): void {
  try {
    if (!storage) return;
    if (consents.length === 0) storage.removeItem(key(eventId));
    else storage.setItem(key(eventId), JSON.stringify({ savedAt: now, consents }));
  } catch {
    // private mode, a full or blocked storage: nothing is remembered
  }
}

const isRecord = (value: unknown): value is ConsentRecord => {
  const v = value as Partial<ConsentRecord> | null;
  return !!v && typeof v === 'object' && typeof v.pageId === 'string' && (v.pageType === 'accept' || v.pageType === 'cta') && typeof v.checkboxText === 'string' && v.accepted === true && typeof v.acceptedAt === 'string';
};

/** The acceptances remembered for the event, or none when there are none, they are too old or are not what was written. */
export function recallConsents(storage: ReadStorage | null | undefined, eventId: string, now: number = Date.now()): ConsentRecord[] {
  try {
    const raw = storage?.getItem(key(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { savedAt?: unknown; consents?: unknown };
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > CONSENT_MEMORY_MAX_AGE_MS || now < parsed.savedAt) return [];
    return Array.isArray(parsed.consents) ? parsed.consents.filter(isRecord) : [];
  } catch {
    return [];
  }
}

export function forgetConsents(storage: Pick<Storage, 'removeItem'> | null | undefined, eventId: string): void {
  try {
    storage?.removeItem(key(eventId));
  } catch {
    // nothing to do
  }
}
