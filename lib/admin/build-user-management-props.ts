/**
 * Build UserManagementActions props from raw submission documents for one logical user.
 * Mirrors aggregation rules in app/admin/users/page.tsx.
 */

import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';

export interface UserManagementProps {
  email: string;
  name: string;
  type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
  role: string;
  isActive: boolean;
  mergedWith?: string;
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

  const hasUserInfo = submission.userInfo?.email && submission.userInfo?.name;
  const isMergedPseudo = hasUserInfo && submission.userInfo?.mergedWith;
  const isAnonymous =
    !hasUserInfo &&
    (submission.userId === 'anonymous' ||
      submission.userEmail === 'anonymous@event.com' ||
      submission.userEmail === 'anonymous@event');

  if (isAnonymous) return null;

  const isPseudoUser = hasUserInfo && !isMergedPseudo;
  const isRealOrAdmin = !hasUserInfo && !isAnonymous;
  const isMergedUser = isMergedPseudo;

  let ssoIdForPermission: string | null = null;
  if (isMergedUser && submission.userInfo?.mergedWith) {
    ssoIdForPermission = submission.userInfo.mergedWith;
  } else if (isRealOrAdmin && submission.userId && submission.userId !== 'anonymous') {
    ssoIdForPermission = submission.userId;
  }

  let userType: UserManagementProps['type'] = 'pseudo';
  let role = 'user';
  let isActive = true;

  if (isMergedUser) {
    userType = 'real';
  } else if (isRealOrAdmin) {
    userType = 'real';
  } else if (isPseudoUser) {
    isActive = submission.userInfo?.isActive !== false;
    userType = 'pseudo';
  }

  const email = hasUserInfo ? submission.userInfo.email : submission.userEmail;
  const name = hasUserInfo ? submission.userInfo.name : submission.userName || 'Unknown';
  const mergedWith = submission.userInfo?.mergedWith;

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
    mergedWith,
  };
}
