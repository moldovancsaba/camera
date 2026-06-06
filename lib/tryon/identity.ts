import type { Submission } from '@/lib/db/schemas';

export interface TryOnIdentity {
  name: string;
  email: string | null;
  userInfo: Submission['userInfo'] | undefined;
}

export function normalizeTryOnDisplayName(value: string | null | undefined): string {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized && normalized.toLowerCase() !== 'event guest' && normalized.toLowerCase() !== 'guest') {
      return normalized;
    }
  }

  return 'Guest';
}

export function isTryOnPlaceholderEmail(value: string | null | undefined): boolean {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return !normalized || normalized === 'anonymous@event' || normalized === 'anonymous@event.com';
}

function firstUsableEmail(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!isTryOnPlaceholderEmail(normalized)) return normalized;
  }

  return null;
}

export function resolveTryOnSubmissionIdentity(
  resultSubmission: Pick<Submission, 'userInfo' | 'userName' | 'userEmail'>,
  sourceSubmission?: Pick<Submission, 'userInfo' | 'userName' | 'userEmail'> | null
): TryOnIdentity {
  const name = normalizeTryOnDisplayName(
    sourceSubmission?.userInfo?.name ??
      sourceSubmission?.userName ??
      resultSubmission.userInfo?.name ??
      resultSubmission.userName
  );
  const email = firstUsableEmail([
    sourceSubmission?.userInfo?.email,
    sourceSubmission?.userEmail,
    resultSubmission.userInfo?.email,
    resultSubmission.userEmail,
  ]);
  const collectedAt =
    sourceSubmission?.userInfo?.collectedAt ??
    resultSubmission.userInfo?.collectedAt ??
    new Date().toISOString();

  return {
    name,
    email,
    userInfo: email || name !== 'Guest'
      ? {
          name,
          ...(email ? { email } : {}),
          collectedAt,
        }
      : undefined,
  };
}
