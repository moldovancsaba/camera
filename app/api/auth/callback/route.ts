/**
 * OAuth Callback API Route
 * 
 * Handles OAuth2 callback from SSO after user authentication.
 * 
 * Flow:
 * 1. Verify state parameter (CSRF protection)
 * 2. Exchange authorization code for tokens
 * 3. Fetch user information
 * 4. Create session with tokens
 * 5. Redirect to homepage or profile
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  decodeIdToken,
  getUserInfo,
  getOAuthCallbackRedirectUri,
  useConfidentialOAuth,
} from '@/lib/auth/sso';
import {
  clearPendingSessionCookieOnResponse,
  createSession,
  readPendingSessionFromRequest,
} from '@/lib/auth/session';
import { decodeSignedOAuthPkceState, getOAuthPkceStateSigningKey } from '@/lib/auth/oauth-pkce-state';
import { getAppPermission, hasAppAccess } from '@/lib/auth/sso-permissions';

/** Prefer capture URL when capture resume cookies exist so users see a clear error in context. */
function redirectOAuthFailure(
  request: NextRequest,
  errorCode: string,
  message: string,
  options?: { clearPendingSession?: boolean }
): NextResponse {
  const captureEventId = request.cookies.get('captureEventId')?.value;

  let res: NextResponse;
  if (captureEventId) {
    const url = new URL(`/capture/${captureEventId}`, request.url);
    url.searchParams.set('error', errorCode);
    url.searchParams.set('message', encodeURIComponent(message));
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.redirect(
      new URL(`/?error=${errorCode}&message=${encodeURIComponent(message)}`, request.url)
    );
  }
  if (options?.clearPendingSession) {
    clearPendingSessionCookieOnResponse(res);
  }
  return res;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors from SSO
    if (error) {
      console.error('✗ OAuth error from SSO:', error);
      const errorDescription = searchParams.get('error_description');
      
      return redirectOAuthFailure(
        request,
        error,
        errorDescription || 'Authentication failed',
        { clearPendingSession: true }
      );
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('✗ Missing code or state parameter');
      return redirectOAuthFailure(request, 'invalid_request', 'Missing required parameters', {
        clearPendingSession: true,
      });
    }

    const confidential = useConfidentialOAuth();
    const redirectUri = getOAuthCallbackRedirectUri(request);

    let codeVerifier: string | undefined;

    if (confidential) {
      const pendingSession = readPendingSessionFromRequest(request);
      if (!pendingSession || pendingSession.state !== state) {
        console.error('✗ OAuth state mismatch or pending cookie missing (confidential flow)');
        return redirectOAuthFailure(
          request,
          'session_expired',
          'Login session expired, please try again',
          { clearPendingSession: true }
        );
      }
    } else {
      const signingKey = getOAuthPkceStateSigningKey();
      let verifier: string | null =
        signingKey && state.includes('.') ? decodeSignedOAuthPkceState(signingKey, state) : null;

      if (!verifier) {
        const pendingSession = readPendingSessionFromRequest(request);
        if (pendingSession?.state === state && pendingSession.codeVerifier) {
          verifier = pendingSession.codeVerifier;
        }
      }

      if (!verifier) {
        console.error('✗ No PKCE verifier (signed state invalid/expired or pending cookie missing)');
        return redirectOAuthFailure(
          request,
          'session_expired',
          'Login session expired, please try again',
          { clearPendingSession: true }
        );
      }
      codeVerifier = verifier;
    }

    console.log('✓ State verified, exchanging code for tokens');

    const tokens = await exchangeCodeForToken(
      code,
      redirectUri,
      confidential ? undefined : codeVerifier
    );
    
    console.log('✓ Tokens obtained, extracting user info from ID token');

    // Extract user information from ID token (JWT)
    // SSO v5.24.0 includes all user claims in the id_token
    let user = decodeIdToken(tokens.id_token);

    console.log('✓ User info extracted:', user.email);

    // If ID token email is missing or the SSO placeholder, enrich from OIDC UserInfo (HTTP only).
    const badEmail =
      !user.email ||
      user.email === 'sso@doneisbetter.com' ||
      user.email === 'unknown@unknown.com';
    if (badEmail) {
      try {
        const info = await getUserInfo(tokens.access_token);
        const email = info.email;
        if (email && email !== 'sso@doneisbetter.com') {
          user = {
            ...user,
            id: info.id || user.id,
            email,
            name: info.name ?? user.name,
            role: info.role ?? user.role,
          };
          console.log('✓ User profile enriched from SSO userinfo');
        }
      } catch (error) {
        console.warn('⚠ SSO userinfo enrichment failed (continuing with ID token claims):', error);
      }
    }

    // WHAT: Query SSO for user's app-specific permission
    // WHY: SSO is the source of truth for app-level roles (user/admin)
    // HOW: Use access token to authenticate with SSO permission endpoint
    let appRole: 'none' | 'user' | 'admin' | 'superadmin' = 'none';
    let appAccess = false;
    
    try {
      const permission = await getAppPermission(user.id, tokens.access_token);
      appRole = permission.role;
      appAccess = hasAppAccess(permission);
      
      console.log('✓ App permission retrieved:', {
        role: appRole,
        hasAccess: appAccess,
        status: permission.status
      });
    } catch (error) {
      console.error('✗ Failed to get app permission:', error);
      // Continue with default (no access) - user will see access denied page
    }

    // Check for capture flow resume (v2.9.0: SSO in capture flow)
    const captureEventId = request.cookies.get('captureEventId')?.value;
    const capturePageIndex = request.cookies.get('capturePageIndex')?.value;
    
    if (captureEventId) {
      console.log('✓ Resuming capture flow:', captureEventId, 'page:', capturePageIndex);
      
      // Redirect back to capture page with resume signal
      const resumeUrl = new URL(`/capture/${captureEventId}`, request.url);
      resumeUrl.searchParams.set('resume', 'true');
      if (capturePageIndex) {
        resumeUrl.searchParams.set('page', capturePageIndex);
      }
      
      const response = NextResponse.redirect(resumeUrl);
      response.cookies.delete('captureEventId');
      response.cookies.delete('capturePageIndex');
      clearPendingSessionCookieOnResponse(response);

      await createSession(user, tokens, { appRole, appAccess }, response);
      console.log('✓ Session created');
      return response;
    }

    console.log('✓ Redirecting to homepage');

    const homeResponse = NextResponse.redirect(new URL('/', request.url));
    clearPendingSessionCookieOnResponse(homeResponse);
    await createSession(user, tokens, { appRole, appAccess }, homeResponse);
    console.log('✓ Session created');
    return homeResponse;
    
  } catch (error) {
    console.error('✗ OAuth callback failed:', error);
    
    return redirectOAuthFailure(
      request,
      'auth_failed',
      error instanceof Error ? error.message : 'Authentication failed',
      { clearPendingSession: true }
    );
  }
}
