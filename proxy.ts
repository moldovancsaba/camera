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

  // WHAT: /admin/login is the single place that decides how to reach SSO
  //     (mirrors messmass). Redirecting straight to /api/auth/login here
  //     bypassed it entirely, and its own "not allowed, don't retry"
  //     fallback used to point at "/" -- fine on its own, but redirecting
  //     an unauthenticated/expired session to /api/auth/login directly
  //     from the edge, in parallel with page-level checks doing the same
  //     via /admin/login, is exactly the kind of redirect-target drift
  //     that produces loops when the two disagree.
  const loginPath = '/admin/login';

  const serialized = readSerializedSessionFromCookieGet((name) => request.cookies.get(name)?.value);
  if (!serialized) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  const gate = parseMiddlewareAuthGate(serialized);
  if (!gate.allow) {
    if (gate.toLogin) {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
    return NextResponse.redirect(new URL('/admin/login?error=no_access', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest)$).*)',
  ],
};

export default proxy;
