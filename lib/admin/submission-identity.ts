/** Resolve a submission's participant identity using one canonical rule across admin views. */
export interface SubmissionIdentity {
  key: string;
  accountId: string | null;
  mergedWith: string | null;
  isAnonymous: boolean;
  isPseudo: boolean;
  email: string;
  name: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSubmissionIdentity(submission: Record<string, unknown>): SubmissionIdentity {
  const userInfo = object(submission.userInfo);
  const infoEmail = string(userInfo.email);
  const infoName = string(userInfo.name);
  const hasUserInfo = Boolean(infoEmail && infoName);
  const rawMergedWith = string(userInfo.mergedWith);
  const mergedWith = rawMergedWith || null;
  const rawUserId = string(submission.userId);
  const submissionUserId = rawUserId && rawUserId !== 'anonymous' ? rawUserId : null;
  // A pseudo identity explicitly linked to an account and an SSO submission are the same logical person.
  const accountId = mergedWith || submissionUserId;
  const legacyEmail = string(submission.userEmail);
  const email = accountId ? legacyEmail : hasUserInfo ? infoEmail : legacyEmail;
  const name = accountId ? string(submission.userName) : hasUserInfo ? infoName : string(submission.userName);
  const normalizedEmail = email.toLowerCase();
  const isAnonymous = !accountId && !hasUserInfo && (!normalizedEmail || normalizedEmail === 'anonymous@event' || normalizedEmail === 'anonymous@event.com');
  const isPseudo = !accountId && !isAnonymous && Boolean(hasUserInfo || email);
  const key = accountId
    ? `account:${accountId}`
    : isPseudo
      ? `pseudo:${normalizedEmail}`
      : `anonymous:${rawUserId || normalizedEmail || string(submission._id)}`;

  return { key, accountId, mergedWith, isAnonymous, isPseudo, email, name };
}
