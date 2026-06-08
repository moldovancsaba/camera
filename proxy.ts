/**
 * Edge proxy:
 * - /admin: require a valid Camera session at the edge; layout, pages, and APIs
 *   enforce global versus partner-scoped access.
 * - OAuth: if IdP returns to a non-callback path with `code`+`state` (or `error`+`state`), forward to `/api/auth/callback`.
 * - GO short host (`GO_SHORT_HOSTNAMES`, e.g. go.messmass.com): single-segment paths like `/selfie` rewrite to
 *   `/api/go-short/selfie`, which 302-redirects to `NEXT_PUBLIC_CAMERA_ORIGIN/capture/{eventMongoId}`.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isGoShortHost } from '@/lib/site-hosts';
import { goShortSlugFromPathname } from '@/lib/go-short-url';
import { readSerializedSessionFromCookieGet } from '@/lib/auth/session-cookie-chunks';
import { parseMiddlewareAuthGate } from '@/lib/auth/middleware-session-gate';

/**
 * IdP may return to `/` with OAuth params while our handler lives at `/api/auth/callback`.
 */
function oauthCallbackRescueIfNeeded(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/auth/callback')) {
    return null;
  }
  const sp = request.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  const oauthError = sp.get('error');
  if ((code && state) || (oauthError && state)) {
    const target = request.nextUrl.clone();
    target.pathname = '/api/auth/callback';
    return NextResponse.redirect(target);
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  const oauthRescue = oauthCallbackRescueIfNeeded(request);
  if (oauthRescue) {
    return oauthRescue;
  }

  if (isGoShortHost(host)) {
    const slug = goShortSlugFromPathname(pathname);
    if (slug) {
      const u = request.nextUrl.clone();
      u.pathname = `/api/go-short/${slug}`;
      return NextResponse.rewrite(u);
    }
  }

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const loginPath = '/api/auth/login';
  const returnPath = `${pathname}${request.nextUrl.search}`;

  const serialized = readSerializedSessionFromCookieGet((name) => request.cookies.get(name)?.value);
  if (!serialized) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('redirectTo', returnPath);
    return NextResponse.redirect(loginUrl);
  }

  const gate = parseMiddlewareAuthGate(serialized);
  if (!gate.allow) {
    if (gate.toLogin) {
      const loginUrl = new URL(loginPath, request.url);
      loginUrl.searchParams.set('redirectTo', returnPath);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('x-camera-return-path', returnPath);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest)$).*)',
  ],
};

export default proxy;
