/**
 * Login API Route
 *
 * Initiates OAuth2 authentication with SSO.
 *
 * Confidential (SSO_CLIENT_SECRET set, SSO_USE_PKCE not forcing PKCE):
 * plain `state`, no PKCE params; small pending cookie with `state` only.
 *
 * PKCE:
 * signed `state` embeds verifier when a signing secret exists; else pending cookie stores verifier + state.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generatePKCEPair,
  generateState,
  getAuthorizationUrl,
  getOAuthCallbackRedirectUri,
  useConfidentialOAuth,
} from '@/lib/auth/sso';
import { setPendingSessionCookie } from '@/lib/auth/session';
import { encodeSignedOAuthPkceState, getOAuthPkceStateSigningKey } from '@/lib/auth/oauth-pkce-state';
import { parseLoginProvider } from '@/lib/auth/social-login';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.LOGIN_INIT);

    const { searchParams } = new URL(request.url);
    const fromLogout = searchParams.get('from_logout') === 'true';
    const provider = parseLoginProvider(searchParams.get('provider'));
    const redirectUri = getOAuthCallbackRedirectUri(request);

    const confidential = useConfidentialOAuth();

    let authUrl: string;

    if (confidential) {
      const state = generateState();
      authUrl = getAuthorizationUrl(null, state, {
        redirectUri,
        prompt: fromLogout ? 'login' : undefined,
        provider,
      });
      const response = NextResponse.redirect(authUrl);
      setPendingSessionCookie(response, { state });
      console.log(
        `✓ Initiating OAuth (confidential, no PKCE)${fromLogout ? ' (force re-auth after logout)' : ''}${provider ? ` (provider=${provider})` : ''}, redirecting to SSO`
      );
      return response;
    }

    const { codeVerifier, codeChallenge } = generatePKCEPair();

    const signingKey = getOAuthPkceStateSigningKey();
    const state = signingKey ? encodeSignedOAuthPkceState(signingKey, codeVerifier) : generateState();

    authUrl = getAuthorizationUrl(codeChallenge, state, {
      redirectUri,
      prompt: fromLogout ? 'login' : undefined,
      provider,
    });

    console.log(
      `✓ Initiating OAuth flow (PKCE)${fromLogout ? ' (force re-auth after logout)' : ''}${provider ? ` (provider=${provider})` : ''}, redirecting to SSO`
    );

    if (!signingKey && process.env.NODE_ENV === 'production') {
      console.warn(
        'OAuth PKCE: set SESSION_SECRET, SSO_CLIENT_SECRET, or OAUTH_PKCE_STATE_SECRET so PKCE uses signed state; otherwise login depends on a short-lived cookie some browsers drop.'
      );
    }

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
