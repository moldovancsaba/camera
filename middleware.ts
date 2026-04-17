/**
 * Edge middleware:
 * - /admin: require authenticated app admin (unchanged).
 * - FunFitFan host: public URLs without `/fff` prefix (`/login`, `/log`, `/history`, `/share/…`, `/reel`) rewrite to `app/fff/*`.
 * - FunFitFan host: legacy `/fff/*` (except bare `/fff`) → 308 to canonical public paths.
 * - FunFitFan host: rewrite `/` → internal `/fff` (landing).
 * - FunFitFan host: bare `/fff` → `/` (preserve query — OAuth `?code=&state=` must not be dropped).
 * - OAuth: if IdP returns to a non-callback path with `code`+`state` (or `error`+`state`), forward to `/api/auth/callback`.
 * - Camera host: optional redirect `/fff` → canonical FFF origin (avoid duplicate URL).
 * - GO short host (`GO_SHORT_HOSTNAMES`, e.g. go.messmass.com): single-segment paths like `/selfie` rewrite to
 *   `/api/go-short/selfie`, which 302-redirects to `NEXT_PUBLIC_CAMERA_ORIGIN/capture/{eventMongoId}`.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCameraHost, isFffHost, isGoShortHost, defaultFffOrigin } from '@/lib/site-hosts';
import { goShortSlugFromPathname } from '@/lib/go-short-url';
import { readSerializedSessionFromCookieGet } from '@/lib/auth/session-cookie-chunks';
import { parseMiddlewareAuthGate } from '@/lib/auth/middleware-session-gate';
import {
  fffHostLegacyPathRedirectTarget,
  fffPublicUrlToInternalPath,
} from '@/lib/funfitfan/fff-browser-urls';

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

  if (isGoShortHost(host)) {
    const slug = goShortSlugFromPathname(pathname);
    if (slug) {
      const u = request.nextUrl.clone();
      u.pathname = `/api/go-short/${slug}`;
      return NextResponse.rewrite(u);
    }
  }

  if (isFffHost(host)) {
    const legacy = fffHostLegacyPathRedirectTarget(pathname);
    if (legacy) {
      return NextResponse.redirect(sameOriginPathWithQuery(request, legacy), 308);
    }

    const internal = fffPublicUrlToInternalPath(pathname);
    if (internal) {
      const url = request.nextUrl.clone();
      url.pathname = internal;
      return NextResponse.rewrite(url);
    }
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

  const loginPath = isFffHost(host) ? '/login' : '/api/auth/login';

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
