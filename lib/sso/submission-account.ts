/**
 * Camera-side mirror of "account disabled" for SSO-linked users.
 * We no longer read the SSO MongoDB; deactivation is stored on submissions here
 * and used for playlist / gallery filtering (with pseudo users still using userInfo.isActive).
 */

import type { Db } from 'mongodb';

import { COLLECTIONS } from '@/lib/db/schemas';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';

const FIELD = 'cameraAccountDisabled' as const;

function exactEmailPattern(email: string): RegExp {
  const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Emails of SSO-backed users marked inactive via Camera admin (not pseudo form). */
export async function getInactiveUserEmailsFromMirror(db: Db): Promise<Set<string>> {
  const emails = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .distinct('userEmail', {
      [FIELD]: true,
      ...PRIVACY_ERASURE_ACTIVE_FILTER,
      userEmail: { $exists: true, $nin: [null, '', 'anonymous@event'] },
    });
  const set = new Set<string>();
  for (const e of emails) {
    if (typeof e === 'string' && e) set.add(e);
  }
  return set;
}

export type SsoAccountLookup =
  | { status: 'found'; userId: string; email: string; name: string | null; source: 'active_session' | 'submission' }
  | { status: 'not_found' }
  | { status: 'ambiguous' };

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve an SSO subject without requiring the account to have submitted a photo.
 * A current Mongo-backed Camera session is an SSO-authenticated identity record;
 * only an unexpired session with SSO-verified email is eligible. Existing
 * submissions remain the durable fallback for accounts whose sessions expired.
 * Conflicting subjects fail closed rather than guessing from a shared address.
 */
export async function lookupSsoAccountByEmail(db: Db, email: string): Promise<SsoAccountLookup> {
  const normalized = normalizedEmail(email);
  if (!normalized) return { status: 'not_found' };

  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const submissionFilter = {
    userEmail: exactEmailPattern(normalized),
    ...PRIVACY_ERASURE_ACTIVE_FILTER,
    userId: { $exists: true, $nin: ['anonymous', null, ''] },
  };
  const submissionIds = await submissions.distinct('userId', submissionFilter);
  const stableSubmissionIds = submissionIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '' && id !== 'anonymous');

  const now = new Date();
  const activeSessionBaseFilter = {
    expireAt: { $gt: now },
    'session.user.email_verified': true,
  };
  const sessionCollection = db.collection(COLLECTIONS.WEB_SESSIONS);
  const normalizedSessionFilter = {
    ...activeSessionBaseFilter,
    identityEmailNormalized: normalized,
    'session.user.email': exactEmailPattern(normalized),
  };
  // Legacy records predate identityEmailNormalized. Their session collection is
  // TTL-bounded, so use an escaped, anchored case-insensitive lookup until those
  // records expire instead of requiring a production backfill.
  const legacySessionFilter = {
    ...activeSessionBaseFilter,
    identityEmailNormalized: { $exists: false },
    'session.user.email': exactEmailPattern(normalized),
  };
  const [normalizedSessionIds, legacySessionIds] = await Promise.all([
    sessionCollection.distinct('session.user.id', normalizedSessionFilter),
    sessionCollection.distinct('session.user.id', legacySessionFilter),
  ]);
  const sessionIds = [...normalizedSessionIds, ...legacySessionIds];
  const stableSessionIds = sessionIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');

  const candidateIds = [...new Set([...stableSubmissionIds, ...stableSessionIds])];
  if (candidateIds.length > 1) return { status: 'ambiguous' };
  const userId = candidateIds[0];
  if (!userId) return { status: 'not_found' };

  const normalizedSession = normalizedSessionIds.includes(userId);
  const session = stableSessionIds.includes(userId)
    ? await sessionCollection.findOne(
        {
          ...(normalizedSession ? normalizedSessionFilter : legacySessionFilter),
          'session.user.id': userId,
        },
        {
          projection: { 'session.user.email': 1, 'session.user.name': 1 },
        }
      )
    : null;
  const submission = stableSubmissionIds.includes(userId)
    ? await submissions.findOne(
        { ...submissionFilter, userId },
        { projection: { userEmail: 1, userName: 1 }, sort: { createdAt: -1 } }
      )
    : null;

  const sessionUser = session?.session?.user;
  const resolvedEmail = typeof sessionUser?.email === 'string'
    ? sessionUser.email.trim()
    : typeof submission?.userEmail === 'string'
      ? submission.userEmail.trim()
      : normalized;
  const resolvedName = typeof sessionUser?.name === 'string' && sessionUser.name.trim()
    ? sessionUser.name.trim()
    : typeof submission?.userName === 'string' && submission.userName.trim()
      ? submission.userName.trim()
      : null;

  return {
    status: 'found',
    userId,
    email: resolvedEmail,
    name: resolvedName,
    source: session ? 'active_session' : 'submission',
  };
}

/** Resolve SSO user id (sub) from an authenticated session or a submission. */
export async function resolveSsoUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const result = await lookupSsoAccountByEmail(db, email);
  return result.status === 'found' ? result.userId : null;
}

export async function setCameraAccountDisabledForEmail(
  db: Db,
  email: string,
  disabled: boolean,
  meta: { actorUserId: string }
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
    { $and: [{ userEmail: email }, PRIVACY_ERASURE_ACTIVE_FILTER] },
    {
      $set: {
        [FIELD]: disabled,
        cameraAccountDisabledAt: disabled ? now : null,
        cameraAccountDisabledBy: disabled ? meta.actorUserId : null,
        updatedAt: now,
      },
    }
  );
  return result.modifiedCount;
}

export { FIELD as CAMERA_ACCOUNT_DISABLED_FIELD };
