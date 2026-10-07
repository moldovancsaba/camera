/**
 * Where a guest's login goes back to (the selfie page it started on, never the dashboard).
 *
 * The login route records the target in a server-set cookie at the moment the OAuth round trip starts (same attributes and lifetime as the
 * OAuth pending cookie, so it lives exactly as long as the login can), and the callback reads it. Before, the target was a cookie the page
 * script wrote just before the click and that lived 10 minutes: when it was missing or had expired (a slow login, a browser that dropped
 * it) the callback fell back to /admin, and a guest without dashboard rights ended on "no access". The legacy cookies are still read, so
 * a login started by an older page still returns.
 *
 * Pure parts, so they are unit-tested (capture-return.test.ts).
 */

import type { NextRequest, NextResponse } from 'next/server';
import { oauthPendingCookieAttrs } from '@/lib/auth/session';

export const CAPTURE_RETURN_COOKIE = 'capture_return';
const LEGACY_EVENT_COOKIE = 'captureEventId';
const LEGACY_PAGE_COOKIE = 'capturePageIndex';
const MAX_AGE_SECONDS = 15 * 60;

/** An event id as it appears in `/capture/<id>`: a 24-character Mongo id or a UUID, nothing that could leave the capture path. */
const EVENT_ID = /^[A-Za-z0-9-]{8,64}$/;

export interface CaptureReturn {
  eventId: string;
  /** The step the guest was on (the login step), so the flow continues after it; null when unknown. */
  page: number | null;
}

export function parseCaptureReturn(eventId: unknown, page?: unknown): CaptureReturn | null {
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) return null;
  const n = typeof page === 'string' && /^\d{1,2}$/.test(page) ? Number(page) : null;
  return { eventId, page: n };
}

export const encodeCaptureReturn = (r: CaptureReturn): string => `${r.eventId}:${r.page ?? ''}`;

export function decodeCaptureReturn(value: string | undefined | null): CaptureReturn | null {
  if (!value) return null;
  const [eventId, page] = value.split(':');
  return parseCaptureReturn(eventId, page);
}

/** The page to open after the login: the capture page, with the resume signal when the step is known. */
export function captureReturnPath(r: CaptureReturn): string {
  return r.page === null ? `/capture/${r.eventId}` : `/capture/${r.eventId}?resume=true&page=${r.page}`;
}

/** The login route: the target named by the link the guest followed, or null for a dashboard login. */
export function captureReturnForLogin(request: NextRequest): CaptureReturn | null {
  const params = request.nextUrl.searchParams;
  return parseCaptureReturn(params.get('captureEvent'), params.get('capturePage'));
}

/** Records the target on the login's redirect to SSO; with no target it removes an older one, so a dashboard login is never sent to a selfie page. */
export function setCaptureReturnCookie(response: NextResponse, target: CaptureReturn | null): void {
  response.cookies.set(CAPTURE_RETURN_COOKIE, target ? encodeCaptureReturn(target) : '', {
    ...oauthPendingCookieAttrs(),
    maxAge: target ? MAX_AGE_SECONDS : 0,
  });
}

/** The callback: the target recorded at the start of this login, else the one a page of the older kind wrote. */
export function readCaptureReturn(request: NextRequest): CaptureReturn | null {
  return (
    decodeCaptureReturn(request.cookies.get(CAPTURE_RETURN_COOKIE)?.value) ??
    parseCaptureReturn(request.cookies.get(LEGACY_EVENT_COOKIE)?.value, request.cookies.get(LEGACY_PAGE_COOKIE)?.value)
  );
}

/** The callback: the target is used once. */
export function clearCaptureReturn(response: NextResponse): void {
  setCaptureReturnCookie(response, null);
  response.cookies.delete(LEGACY_EVENT_COOKIE);
  response.cookies.delete(LEGACY_PAGE_COOKIE);
}
