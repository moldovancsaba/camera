/**
 * Edge middleware:
 * - /admin: require authenticated app admin (unchanged).
 * - FunFitFan host: rewrite `/` → `/fff` (landing + PWA scope on fff.*).
 * - Camera host: optional redirect `/fff` → canonical FFF origin (avoid duplicate URL).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCameraHost, isFffHost, defaultFffOrigin } from '@/lib/site-hosts';
import { readSerializedSessionFromCookieGet } from '@/lib/auth/session-cookie-chunks';
import { parseMiddlewareAuthGate } from '@/lib/auth/middleware-session-gate';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  if (isFffHost(host) && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone();
    url.pathname = '/fff';
    return NextResponse.rewrite(url);
  }

  if (isFffHost(host) && pathname === '/fff') {
    return NextResponse.redirect(new URL('/', request.url));
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
