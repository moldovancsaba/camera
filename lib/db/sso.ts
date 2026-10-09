/**
 * SSO-related data access without connecting to the SSO service MongoDB.
 *
 * Inactive SSO-linked users are mirrored on Camera `submissions` via
 * `cameraAccountDisabled` (see lib/sso/submission-account.ts).
 */

import { ttlOnce } from '@/lib/cache/ttl-once';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getInactiveUserEmailsFromMirror } from '@/lib/sso/submission-account';

/** The playlist asks for this at every call (about once a slide per screen) and it scans the submissions, so it is kept for a minute (camera#476). */
const INACTIVE_EMAILS_TTL_MS = 60_000;

const inactiveUserEmails = ttlOnce(async () => getInactiveUserEmailsFromMirror(await connectToDatabase()), INACTIVE_EMAILS_TTL_MS);

/**
 * Emails of users whose submissions should be hidden (SSO-linked, disabled in Camera admin). Up to a minute old on a server instance
 * that did not make the change itself; `clearInactiveUserEmailsCache` makes the next call read again.
 */
export function getInactiveUserEmails(): Promise<Set<string>> {
  return inactiveUserEmails();
}

export const clearInactiveUserEmailsCache = inactiveUserEmails.clear;
