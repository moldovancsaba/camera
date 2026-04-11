/**
 * Logout API Route
 * 
 * Handles user logout.
 * 
 * Flow:
 * 1. Get current session
 * 2. Revoke tokens at SSO (best effort)
 * 3. Clear local session cookie
 * 4. Redirect to homepage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSession } from '@/lib/auth/session';
import { revokeToken } from '@/lib/auth/sso';

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

    // Redirect to homepage
    return NextResponse.redirect(new URL('/?logout=success', request.url));
    
  } catch (error) {
    console.error('✗ Logout error:', error);
    
    // Even if there's an error, clear the session and redirect
    await clearSession();
    
    return NextResponse.redirect(new URL('/?logout=error', request.url));
  }
}

export async function POST(request: NextRequest) {
  // Support POST method as well for logout buttons
  return GET(request);
}
