/**
 * Edge middleware: restrict /admin UI to authenticated users with app admin role.
 * API routes under /api/admin/* remain guarded by requireAdmin() in each handler.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  const gate = parseAdminGate(cookie);
  if (!gate.allow) {
    const target = gate.toLogin ? '/api/auth/login' : '/';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
