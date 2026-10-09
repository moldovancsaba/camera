/**
 * The hook that writes the activity log (issue 517): `withErrorHandler` hands every answer to `observeApiRequest`, which decides whether the request is an activity
 * (lib/activity/log.ts) and writes it after the answer has been sent. It does nothing unless the log is on (the production deployment), reads the session and the database only then,
 * never throws and never delays the answer. Server side.
 */

import type { NextRequest } from 'next/server';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { activityLogEnabled, activityOf, isRepeat, recordActivity, type ObservedPerson } from './log';

/** The reason an answer gave (`error` or `message` of its JSON body), read from a copy of the answer. */
async function reasonOf(copy: Response | null): Promise<string | null> {
  if (!copy) return null;
  try {
    const body = (await copy.json()) as { error?: unknown; message?: unknown };
    const text = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : '';
    return text || null;
  } catch {
    return null;
  }
}

async function currentPerson(): Promise<ObservedPerson | null> {
  const { getSession } = await import('@/lib/auth/session');
  const session = await getSession().catch(() => null);
  if (!session?.user) return null;
  return { id: session.user.id ?? null, email: session.user.email ?? null, role: session.appRole ?? null };
}

export function observeApiRequest(request: NextRequest, response: Response): void {
  try {
    if (!activityLogEnabled()) return;
    const status = response.status;
    const { pathname, searchParams } = request.nextUrl;
    const method = request.method;
    // A cheap look first: an ok read is never an activity, so it costs nothing.
    if ((method === 'GET' || method === 'HEAD' || method === 'OPTIONS') && status < 500) return;
    // The reason is read from a copy made now: the answer itself is consumed when it is sent.
    const copy = status >= 400 ? response.clone() : null;
    runAfterResponse(async () => {
      try {
        const person = await currentPerson();
        const record = activityOf({ method, pathname, search: searchParams }, status, person, new Date(), await reasonOf(copy));
        if (!record || isRepeat(record, Date.now())) return;
        const { connectToDatabase } = await import('@/lib/db/mongodb');
        await recordActivity(await connectToDatabase(), record);
      } catch {
        // the log never fails a request
      }
    });
  } catch {
    // nor does looking at it
  }
}
