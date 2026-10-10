/**
 * The activity log (issue 517; owner request 2026-10-09: "log activities, error feedbacks, who did and when; weekly send it as csv to ... keep for a week, then delete when the next you
 * send out"). One record for **what the people who manage the service did** (every save, upload, approval, removal: a request that changes something, answered ok) and for **every
 * request that was refused or failed** (4xx and 5xx, by anybody, with who when it is known). A page view is not an activity; the photos guests take are not either (the analytics
 * of issue 521 are for those).
 *
 * What a record holds: when, who (the account's id, e-mail and role; none for an anonymous error), the method, the path (and the ids in its query, nothing else), the status, the outcome
 * (`ok`, `refused`, `error`) and, for a failure, the reason the answer gave (cut at 300 characters). No request body, no IP address, no device, nothing a guest typed.
 *
 * It is written after the answer was sent, once per `withErrorHandler` route (lib/api/withErrorHandler.ts), only on the production deployment, and never fails the request. The same
 * failure of the same person on the same path is written once a minute at most, so a broken page does not fill the log. Server side.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export type ActivityOutcome = 'ok' | 'refused' | 'error';

export interface ActivityRecord {
  /** ISO 8601 time the request was answered. */
  at: string;
  method: string;
  path: string;
  status: number;
  outcome: ActivityOutcome;
  userId: string | null;
  userEmail: string | null;
  role: string | null;
  /** Why the request was refused or failed, as the answer said (never a body the person sent). */
  message?: string;
}

/** What a request needs to be looked at: the parts of `Request` and of the session the log reads. */
export interface ObservedRequest {
  method: string;
  /** The path only, e.g. `/api/events/abc/gallery-frame`. */
  pathname: string;
  /** The query, of which only the ids are kept. */
  search: URLSearchParams;
}

export interface ObservedPerson {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}

const MANAGEMENT_PREFIXES = ['/api/admin/', '/api/events', '/api/partners', '/api/slideshows', '/api/slideshow-layouts', '/api/frames', '/api/images', '/api/logos', '/api/landing-pages', '/api/hashtags', '/api/upload-logo'] as const;

/** Requests that are neither a management action nor worth recording when they fail: beacons and reports the screens and phones send all the time. */
const NOISE = [/^\/api\/observability\//, /^\/api\/media\/broken$/, /^\/api\/slideshows\/[^/]+\/(played|next-candidate)$/, /^\/api\/auth\//, /^\/api\/go-short\//];

const QUERY_KEYS = ['id', 'eventId', 'slug', 'slideshowId'] as const;
const MAX_MESSAGE = 300;

const isReadMethod = (method: string) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

/** Whether a request on this path is a management action when it changes something (the paths that need a signed-in person). */
export function isManagementPath(pathname: string): boolean {
  return MANAGEMENT_PREFIXES.some((prefix) => (prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export function outcomeOf(status: number): ActivityOutcome {
  return status >= 500 ? 'error' : status >= 400 ? 'refused' : 'ok';
}

/**
 * The record of a request, or null when it is not an activity: a read that did not fail on the server, noise, an ok change on a path that is not a management action, or an ok change by
 * nobody signed in.
 */
export function activityOf(request: ObservedRequest, status: number, person: ObservedPerson | null, now: Date, message?: string | null): ActivityRecord | null {
  if (NOISE.some((pattern) => pattern.test(request.pathname))) return null;
  const method = request.method.toUpperCase();
  const outcome = outcomeOf(status);
  if (isReadMethod(method) && outcome !== 'error') return null;
  if (outcome === 'ok' && !(isManagementPath(request.pathname) && person && (person.id || person.email))) return null;
  const query = QUERY_KEYS.flatMap((key) => (request.search.get(key) ? [`${key}=${request.search.get(key)!.slice(0, 80)}`] : [])).join('&');
  const text = typeof message === 'string' ? message.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE) : '';
  return {
    at: now.toISOString(),
    method,
    path: query ? `${request.pathname}?${query}` : request.pathname,
    status,
    outcome,
    userId: person?.id ?? null,
    userEmail: person?.email?.trim().toLowerCase() || null,
    role: person?.role ?? null,
    ...(outcome !== 'ok' && text ? { message: text } : {}),
  };
}

const RECENT_WINDOW_MS = 60_000;
const RECENT_MAX = 500;
const recent = new Map<string, number>();

/** True when the same failure of the same person on the same path was written less than a minute ago (an ok action is never held back). */
export function isRepeat(record: ActivityRecord, nowMs: number, seen: Map<string, number> = recent): boolean {
  if (record.outcome === 'ok') return false;
  const key = `${record.method} ${record.path} ${record.status} ${record.userId ?? ''}`;
  const last = seen.get(key);
  if (last !== undefined && nowMs - last < RECENT_WINDOW_MS) return true;
  if (seen.size >= RECENT_MAX) seen.delete(seen.keys().next().value as string);
  seen.set(key, nowMs);
  return false;
}

/** Writes a record; never throws (the log must never fail a request). */
export async function recordActivity(db: Db, record: ActivityRecord): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.ACTIVITY_LOG).insertOne({ ...record });
    return true;
  } catch {
    return false;
  }
}

/** Only the production deployment writes the log: a preview or a local run uses the same database and must not fill it. `ACTIVITY_LOG=1` turns it on elsewhere, `0` off. */
export function activityLogEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ACTIVITY_LOG === '1') return true;
  if (env.ACTIVITY_LOG === '0') return false;
  return env.VERCEL_ENV === 'production';
}
