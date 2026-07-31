/**
 * POST /api/internal/messmass/sso-session
 *
 * WHAT: Mints a real camera login session for a user who just logged into
 *     messmass via SSO -- the reverse-direction sibling of messmass's
 *     /api/internal/camera/sso-session. Together these give a user who logs
 *     into EITHER app a session cookie for BOTH, without a second OAuth
 *     round-trip, as long as SESSION_COOKIE_DOMAIN=.messmass.com is set here
 *     (see lib/auth/session.ts) so the resulting cookie is visible on both
 *     hosts.
 *
 * WHY: messmass and camera use completely different session formats
 *     (camera_session vs admin-session) with no shared secret between them
 *     -- there's no way to "translate" one into the other without minting a
 *     real session through each app's own code.
 *
 * SECURITY: the shared secret (assertInternalMessmassSecret) only proves
 *     "this call came from our messmass deployment" -- it does NOT by
 *     itself authorize minting a session for an arbitrary user id. This
 *     endpoint additionally verifies the forwarded access token directly
 *     against SSO itself (getUserInfo + getAppPermission, using CAMERA's
 *     own SSO_CLIENT_ID, exactly like the real OAuth callback does) --
 *     never trusting a user id/role asserted by the caller. This bounds a
 *     leaked shared secret to "can trigger sessions for users who currently
 *     hold a live SSO token", not "can impersonate anyone".
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, checkRateLimit, RATE_LIMITS, apiBadRequest, apiUnauthorized } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { getUserInfo, type TokenResponse } from '@/lib/auth/sso';
import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';
import { createSession } from '@/lib/auth/session';

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const body = await request.json().catch(() => ({}));
  const accessToken = String(body?.accessToken || '').trim();
  if (!accessToken) {
    throw apiBadRequest('accessToken is required');
  }

  let user;
  try {
    user = await getUserInfo(accessToken);
  } catch {
    throw apiUnauthorized('Invalid or expired SSO access token');
  }
  if (!user.id) {
    throw apiUnauthorized('SSO did not return a user id for this token');
  }

  const permission = await getAppPermission(user.id, accessToken);
  if (!hasAppAccess(permission)) {
    return NextResponse.json({ success: false, error: 'no_access' }, { status: 403 });
  }

  const tokens: TokenResponse = {
    access_token: accessToken,
    refresh_token: String(body?.refreshToken || ''),
    id_token: '',
    expires_in: Number(body?.expiresIn) > 0 ? Number(body.expiresIn) : 3600,
    token_type: 'Bearer',
    scope: 'openid profile email',
  };

  const response = NextResponse.json({ success: true, appRole: permission.role });
  await createSession(user, tokens, { appRole: permission.role, appAccess: true }, response);
  return response;
});
