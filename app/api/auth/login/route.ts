/**
 * Login API Route
 * 
 * Initiates OAuth2 authentication flow with SSO.
 * 
 * Flow:
 * 1. Generate PKCE code verifier and challenge
 * 2. Generate state for CSRF protection
 * 3. If no server signing key: store verifier + random state in pending cookie. Else: embed verifier in signed `state` only.
 * 4. Redirect user to SSO authorization endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generatePKCEPair,
  generateState,
  getAuthorizationUrl,
  getOAuthCallbackRedirectUri,
} from '@/lib/auth/sso';
import { setPendingSessionCookie } from '@/lib/auth/session';
import { encodeSignedOAuthPkceState, getOAuthPkceStateSigningKey } from '@/lib/auth/oauth-pkce-state';
import { parseLoginProvider } from '@/lib/auth/social-login';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.LOGIN_INIT);

    // Generate PKCE pair for security
    const { codeVerifier, codeChallenge } = generatePKCEPair();

    const signingKey = getOAuthPkceStateSigningKey();
    // Prefer signed state (verifier round-trips in `state`) when a server secret exists — avoids relying on cookies on the IdP return hop (Chrome).
    const state = signingKey ? encodeSignedOAuthPkceState(signingKey, codeVerifier) : generateState();

    // Check if user just logged out (from query param or referer)
    const { searchParams } = new URL(request.url);
    const fromLogout = searchParams.get('from_logout') === 'true';
    const provider = parseLoginProvider(searchParams.get('provider'));

    // Build authorization URL with PKCE challenge
    // If user just logged out, force re-authentication with prompt=login
    const redirectUri = getOAuthCallbackRedirectUri(request);
    const authUrl = getAuthorizationUrl(codeChallenge, state, {
      redirectUri,
      prompt: fromLogout ? 'login' : undefined,
      provider,
    });

    console.log(
      `✓ Initiating OAuth flow${fromLogout ? ' (force re-auth after logout)' : ''}${provider ? ` (provider=${provider})` : ''}, redirecting to SSO`
    );

    if (!signingKey && process.env.NODE_ENV === 'production') {
      console.warn(
        'OAuth: set SESSION_SECRET, SSO_CLIENT_SECRET, or OAUTH_PKCE_STATE_SECRET so PKCE uses signed state; otherwise login depends on a short-lived cookie some browsers drop.'
      );
    }

    // Set pending cookie on the same response as the redirect so Set-Cookie is not dropped
    // (cookies().set + NextResponse.redirect is unreliable in App Router route handlers)
    const response = NextResponse.redirect(authUrl);
    if (!signingKey) {
      setPendingSessionCookie(response, { codeVerifier, state });
    }
    return response;
    
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    console.error('✗ Login initiation failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to initiate login',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
