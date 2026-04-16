/**
 * Edge middleware:
 * - /admin: require authenticated app admin (unchanged).
 * - FunFitFan host: rewrite `/` → `/fff` (landing + PWA scope on fff.*).
 * - Camera host: optional redirect `/fff` → canonical FFF origin (avoid duplicate URL).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCameraHost, isFffHost, defaultFffOrigin } from '@/lib/site-hosts';

const SESSION_COOKIE_NAME = 'camera_session';

function parseAdminGate(
  raw: string
): { allow: true } | { allow: false; toLogin: boolean } {
  try {
    const session = JSON.parse(raw) as {
      expiresAt?: string;
      appRole?: string;
      appAccess?: boolean;
    };

    if (session.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (now >= expiresAt) {
        return { allow: false, toLogin: true };
      }
    }

    if (session.appAccess === false) {
      return { allow: false, toLogin: false };
    }

    const role = session.appRole;
    if (role !== 'admin' && role !== 'superadmin') {
      return { allow: false, toLogin: false };
    }

    return { allow: true };
  } catch {
    return { allow: false, toLogin: true };
  }
}

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

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  const gate = parseAdminGate(cookie);
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
