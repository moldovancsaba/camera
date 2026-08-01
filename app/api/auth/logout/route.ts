/**
 * Logout API Route
 *
 * Handles user logout.
 *
 * Flow:
 * 1. Get current session
 * 2. Revoke tokens at SSO (best effort)
 * 3. Clear local session cookie
 * 4. Set a short-lived post-logout marker (see below)
 * 5. Redirect to the public homepage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSession } from '@/lib/auth/session';
import { revokeToken } from '@/lib/auth/sso';

// WHAT: Non-sensitive, 2-minute marker so the next /api/auth/login hit
//     (however it's reached -- the homepage's CTA, /admin/login's own
//     auto-redirect, a bookmark) forces SSO to show its real login screen
//     instead of silently re-approving.
// WHY: Revoking this app's own SSO tokens doesn't end the session cookie
//     SSO itself holds. Without this, signing back in right after logout
//     can look like logout never happened.
function withPostLogoutMarker(response: NextResponse): NextResponse {
  response.cookies.set('post-logout', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 120,
    path: '/',
  });
  return response;
}

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession();

    if (session) {
      // Attempt to revoke tokens at SSO (best effort, doesn't block logout)
      try {
        await revokeToken(session.accessToken, 'access_token');
        await revokeToken(session.refreshToken, 'refresh_token');
        console.log('✓ Tokens revoked at SSO');
      } catch (error) {
        console.error('⚠ Token revocation failed (non-blocking):', error);
        // Don't throw - revocation failure shouldn't block logout
      }
    }

    // Clear local session
    await clearSession();

    console.log('✓ Logout successful');

    // Redirect to the public homepage -- it's a plain landing page now, not
    // auth-aware, so no ?logout=success signal is needed here.
    return withPostLogoutMarker(NextResponse.redirect(new URL('/', request.url)));

  } catch (error) {
    console.error('✗ Logout error:', error);

    // Even if there's an error, clear the session and redirect
    await clearSession();

    return withPostLogoutMarker(NextResponse.redirect(new URL('/', request.url)));
  }
}

export async function POST(request: NextRequest) {
  // Support POST method as well for logout buttons
  return GET(request);
}
