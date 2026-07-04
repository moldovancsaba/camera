/**
 * Development Mock Login
 *
 * Bypass for SSO authentication during development and E2E tests.
 * Creates a mock session without requiring SSO.
 *
 * Production safety: blocked by blockDangerousApiInProduction() — returns 404
 * under NODE_ENV=production unless ALLOW_DANGEROUS_DEV_ROUTES='true' (private
 * staging only). Verified by `npm run verify:production-guards`.
 */

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth/session';
import type { TokenResponse } from '@/lib/auth/sso';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export async function GET(request: NextRequest) {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  const searchParams = request.nextUrl.searchParams;
  const email = searchParams.get('email')?.trim() || 'dev@camera.local';
  const name = searchParams.get('name')?.trim() || 'Development User';
  const roleParam = searchParams.get('role');
  const accessParam = searchParams.get('access');
  const redirectTo = searchParams.get('redirectTo')?.trim() || '/';
  const userId = searchParams.get('userId')?.trim() || 'dev-user-001';
  const appRole =
    roleParam === 'none' || roleParam === 'user' || roleParam === 'admin' || roleParam === 'superadmin'
      ? roleParam
      : 'admin';
  const appAccess = accessParam == null ? true : accessParam === 'true';

  // Create a mock user session for development
  const mockUser = {
    id: userId,
    email,
    name,
    role: appRole === 'superadmin' ? ('admin' as const) : ('user' as const),
  };

  // Create mock tokens for development
  // Generate a fake ID token (JWT) with user claims
  const mockIdTokenPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    role: mockUser.role,
    email_verified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const mockIdToken = `mock.${Buffer.from(JSON.stringify(mockIdTokenPayload)).toString('base64url')}.mock`;

  const mockTokens: TokenResponse = {
    access_token: 'dev-access-token',
    refresh_token: 'dev-refresh-token',
    id_token: mockIdToken,
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'openid profile email',
  };

  const origin = request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(redirectTo, origin));
  await createSession(mockUser, mockTokens, { appRole, appAccess }, response);
  return response;
}
