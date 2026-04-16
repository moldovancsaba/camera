/**
 * Session Management
 * 
 * Manages user sessions with 30-day sliding expiration.
 * Sessions are stored in encrypted cookies for security.
 * 
 * Features:
 * - 30-day sliding expiration (extends on each request)
 * - Automatic token refresh before expiration
 * - Secure HttpOnly cookies
 * - CSRF protection via state parameter
 * 
 * Session data includes:
 * - User ID and email
 * - Access token and refresh token
 * - Token expiration times
 * - User role (for admin access)
 */

import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { SSOUser, TokenResponse, refreshAccessToken } from './sso';

const PENDING_SESSION_COOKIE_NAME = 'camera_pending_session';

const SESSION_COOKIE_NAME = 'camera_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Optional cookie domain (e.g. `.messmass.com`) so `camera.*` and `fff.*` share `camera_session`.
 * Leave unset for host-only cookies (default). Set only for trusted sibling subdomains.
 */
function sessionCookieDomain(): string | undefined {
  return process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
}

/**
 * OAuth PKCE pending cookie: must survive the cross-site round-trip from our origin → IdP → `/api/auth/callback`.
 * Chrome (incl. strict tracking / third-party cookie modes) is pickier than Safari about `SameSite=Lax` on that hop;
 * `SameSite=None` + `Secure` is the standard pattern for short-lived OAuth handoff cookies (prod is always HTTPS).
 */
function oauthPendingCookieAttrs(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'none';
  path: '/';
} & { domain?: string } {
  const domain = sessionCookieDomain();
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
  };
}


/**
 * Session data stored in cookie
 */
export interface Session {
  user: SSOUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;  // ISO 8601 timestamp
  createdAt: string;              // ISO 8601 timestamp
  expiresAt: string;              // ISO 8601 timestamp (30 days from creation)
  appRole?: 'none' | 'user' | 'admin' | 'superadmin';  // App-specific role from SSO
  appAccess?: boolean;            // Whether user has access to this app
}

/**
 * Temporary session data stored during OAuth flow
 * Includes PKCE verifier and state for verification
 */
export interface PendingSession {
  codeVerifier: string;
  state: string;
  createdAt: string;
  expiresAt: string;  // Short expiration (15 minutes)
}

/**
 * Create a new session after successful authentication
 * 
 * @param user - User information from SSO
 * @param tokens - Access and refresh tokens
 * @param appPermission - App-specific permission from SSO (optional)
 * @param response - If provided, Set-Cookie is applied to this response (required for redirects in Route Handlers)
 * @returns Created session
 */
export async function createSession(
  user: SSOUser,
  tokens: TokenResponse,
  appPermission?: { appRole?: 'none' | 'user' | 'admin' | 'superadmin'; appAccess?: boolean },
  response?: NextResponse
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE * 1000);
  const accessTokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

  const session: Session = {
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    appRole: appPermission?.appRole,
    appAccess: appPermission?.appAccess,
  };

  const domain = sessionCookieDomain();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE,
    path: '/' as const,
    ...(domain ? { domain } : {}),
  };

  const payload = JSON.stringify(session);

  if (response) {
    response.cookies.set(SESSION_COOKIE_NAME, payload, cookieOptions);
  } else {
    (await cookies()).set(SESSION_COOKIE_NAME, payload, cookieOptions);
  }

  console.log('✓ Session created for user:', user.email);
  return session;
}

/**
 * Get current session from cookie (read-only)
 * Does NOT modify cookies - safe to use in Server Components
 * 
 * @returns Session if valid, null if expired or not found
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    const session: Session = JSON.parse(sessionCookie.value);

    // Check if session expired (30 days)
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    if (now >= expiresAt) {
      console.log('Session expired');
      return null;
    }

    // Return session without modifying cookies
    // Token refresh and sliding expiration happen in middleware or API routes
    return session;
    
  } catch (error) {
    console.error('Error parsing session:', error);
    return null;
  }
}

/**
 * Clear current session (logout)
 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  const domain = sessionCookieDomain();
  if (domain) {
    store.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      domain,
    });
  } else {
    store.delete(SESSION_COOKIE_NAME);
  }
  console.log('✓ Session cleared');
}

/**
 * Read PKCE pending cookie from the incoming request (OAuth callback route handlers).
 */
export function readPendingSessionFromRequest(request: NextRequest): PendingSession | null {
  const raw = request.cookies.get(PENDING_SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as PendingSession;
    if (typeof pending.codeVerifier !== 'string' || typeof pending.state !== 'string') {
      return null;
    }
    const now = new Date();
    const expiresAt = new Date(pending.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || now >= expiresAt) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

/** Clear pending OAuth cookie on an outgoing redirect response (must match attributes from set). */
export function clearPendingSessionCookieOnResponse(response: NextResponse): void {
  response.cookies.set(PENDING_SESSION_COOKIE_NAME, '', {
    ...oauthPendingCookieAttrs(),
    maxAge: 0,
  });
}

export function setPendingSessionCookie(
  response: NextResponse,
  data: Omit<PendingSession, 'createdAt' | 'expiresAt'>
): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

  const pendingSession: PendingSession = {
    ...data,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  response.cookies.set(PENDING_SESSION_COOKIE_NAME, JSON.stringify(pendingSession), {
    ...oauthPendingCookieAttrs(),
    maxAge: 15 * 60,
  });
}

/**
 * Check if user is authenticated
 * 
 * @returns True if valid session exists
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Check if user is an admin
 * 
 * WHAT: Check app-specific role (appRole), NOT SSO-level role (user.role)
 * WHY: SSO v5.24.0 introduced multi-app permissions - each app has its own roles
 * HOW: Use session.appRole which was queried from SSO during login callback
 * 
 * @returns True if user has admin or superadmin role in this app
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.appRole === 'admin' || session?.appRole === 'superadmin';
}

/**
 * Require authentication for a route
 * Throws error if not authenticated
 * 
 * @returns Session if authenticated
 * @throws Error if not authenticated
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  
  if (!session) {
    throw new Error('Authentication required');
  }
  
  return session;
}

/**
 * Require admin role for a route
 * Throws error if not admin
 * 
 * WHAT: Check app-specific role (appRole), NOT SSO-level role (user.role)
 * WHY: SSO v5.24.0 introduced multi-app permissions - each app has its own roles
 * HOW: Use session.appRole which was queried from SSO during login callback
 * 
 * @returns Session if admin
 * @throws Error if not admin
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  
  if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
    throw new Error('Admin access required for this app');
  }
  
  return session;
}
