/**
 * Edge middleware:
 * - /admin: require authenticated app admin (unchanged).
 * - FunFitFan host: rewrite `/` → `/fff` (landing + PWA scope on fff.*).
 * - FunFitFan host: `/fff` → `/` canonical URL (preserve query — OAuth `?code=&state=` must not be dropped).
 * - OAuth: if IdP returns to a non-callback path with `code`+`state` (or `error`+`state`), forward to `/api/auth/callback`.
 * - Camera host: optional redirect `/fff` → canonical FFF origin (avoid duplicate URL).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCameraHost, isFffHost, defaultFffOrigin } from '@/lib/site-hosts';
import { readSerializedSessionFromCookieGet } from '@/lib/auth/session-cookie-chunks';
import { parseMiddlewareAuthGate } from '@/lib/auth/middleware-session-gate';

/** `new URL('/', request.url)` drops the query string; copy params when building a same-origin redirect target. */
function sameOriginPathWithQuery(request: NextRequest, pathname: string): URL {
  const u = new URL(pathname, request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    u.searchParams.set(key, value);
  });
  return u;
}

/**
 * IdP may return to `/` or `/fff` with OAuth params while our handler lives at `/api/auth/callback`.
 * Without this, `/fff` → `/` used to strip `code`/`state` and login looked like a silent no-op.
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  const oauthRescue = oauthCallbackRescueIfNeeded(request);
  if (oauthRescue) {
    return oauthRescue;
  }

  if (isFffHost(host) && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone();
    url.pathname = '/fff';
    return NextResponse.rewrite(url);
  }

  if (isFffHost(host) && pathname === '/fff') {
    return NextResponse.redirect(sameOriginPathWithQuery(request, '/'));
  }

  if (isCameraHost(host) && pathname === '/fff') {
    return NextResponse.redirect(new URL('/', defaultFffOrigin()));
  }

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const loginPath = isFffHost(host) ? '/fff/login' : '/api/auth/login';

  const serialized = readSerializedSessionFromCookieGet((name) => request.cookies.get(name)?.value);
  if (!serialized) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  const gate = parseMiddlewareAuthGate(serialized);
  if (!gate.allow) {
    const target = gate.toLogin ? loginPath : '/';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest)$).*)',
  ],
};
