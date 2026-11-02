/**
 * Build UserManagementActions props from raw submission documents for one logical user.
 * Mirrors aggregation rules in app/admin/users/page.tsx.
 */

import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';
import { resolveSubmissionIdentity } from '@/lib/admin/submission-identity';

export interface UserManagementProps {
  email: string;
  name: string;
  type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
  role: string;
  isActive: boolean;
  mergedWith?: string;
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(rawName: string | undefined | null): string {
  const normalized = typeof rawName === 'string' ? rawName.trim() : '';
  return normalized && !isLegacyGuestName(normalized) ? normalized : 'Unknown';
}

/**
 * @param submissions Raw Mongo docs for this profile (same order as admin list: newest first)
 */
export async function buildUserManagementPropsFromSubmissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy submission shapes from Mongo
  submissions: any[],
  accessToken: string | null | undefined
): Promise<UserManagementProps | null> {
  if (!submissions.length) return null;

  const accountDisabledMirror = submissions.some((s) => s.cameraAccountDisabled === true);
  const submission = submissions[0];
  const identities = submissions.map((s) => resolveSubmissionIdentity(s));
  const identity = identities.find((candidate) => candidate.accountId) ?? identities[0];
  const accountId = identity.accountId;
  const mergedWith = identities.find((candidate) => candidate.mergedWith)?.mergedWith;
  const isAnonymous = identities.every((candidate) => candidate.isAnonymous);

  if (isAnonymous) return null;

  const isPseudoUser = !accountId && identities.some((candidate) => candidate.isPseudo);
  const isRealOrAdmin = Boolean(accountId) && !isAnonymous;
  const ssoIdForPermission = isRealOrAdmin ? accountId : null;

  let userType: UserManagementProps['type'] = 'pseudo';
  let role = 'user';
  let isActive = true;

  if (isRealOrAdmin) {
    userType = 'real';
  } else if (isPseudoUser) {
    isActive = submission.userInfo?.isActive !== false;
    userType = 'pseudo';
  }

  const email = identity.email;
  const name = resolveDisplayName(identity.name);

  if (accessToken && ssoIdForPermission) {
    try {
      const perm = await getAppPermission(ssoIdForPermission, accessToken);
      const r = perm.role;
      role = r === 'superadmin' ? 'admin' : r;
      userType = r === 'admin' || r === 'superadmin' ? 'administrator' : 'real';
      const approved = hasAppAccess(perm);
      isActive = approved && !accountDisabledMirror;
    } catch (e) {
      console.warn('[buildUserManagementPropsFromSubmissions] getAppPermission failed', e);
      isActive = !accountDisabledMirror;
    }
  } else if (userType === 'real') {
    isActive = !accountDisabledMirror;
  }

  if (userType === 'pseudo') {
    isActive = isActive !== false;
  }

  return {
    email,
    name,
    type: userType,
    role,
    isActive,
    mergedWith: mergedWith ?? undefined,
  };
}
