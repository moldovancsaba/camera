/**
 * The daily follow-up e-mail (epic 463, issue 559, lib/email/follow-up.ts): once to each user with an approved photo, a week after the event, for the events that have it switched on. Called by the daily
 * cron of vercel.json with Vercel's `Authorization: Bearer <CRON_SECRET>`; fails closed (403) when CRON_SECRET is not set on the project (the owner's step, issue 529, RUNBOOK), so until then it does
 * nothing and an admin starts it by hand (POST /api/admin/follow-up-emails). Safe to run twice: each e-mail is claimed before it is sent.
 */

import { NextRequest } from 'next/server';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { runFollowUps } from '@/lib/email/follow-up';
import { followUpMaxAgeDays } from '@/lib/email/follow-up-rules';
import { sendSubmissionResultEmail } from '@/lib/email/submission-notification';
import { logInfo } from '@/lib/observability/logger';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Stop starting new e-mails after this long, so the last one ends inside the function's 60 seconds. */
const BUDGET_MS = 40_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const check = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (check !== 'ok') {
    if (check === 'not_configured') console.warn('[internal-auth] follow-up e-mail cron: CRON_SECRET is not configured; the daily job stays disabled (fail closed)');
    else logSharedSecretRejection('follow-up e-mail cron', 'CRON_SECRET', check);
    throw apiForbidden();
  }
  const db = await connectToDatabase();
  const result = await runFollowUps(
    db,
    { send: sendSubmissionResultEmail, now: () => new Date(), maxAgeDays: followUpMaxAgeDays(process.env.FOLLOW_UP_MAX_AGE_DAYS), budgetMs: BUDGET_MS },
    { dryRun: false }
  );
  // The counts only: no address, no name of a person.
  logInfo('follow_up.run', 'The daily follow-up e-mail run ended', {
    eventsOn: result.eventsOn,
    eligible: result.eligible,
    sent: result.sent,
    failed: result.failed,
    alreadySent: result.alreadySent,
    held: result.held,
    gaveUp: result.gaveUp,
    remaining: result.remaining,
  });
  return apiSuccess(result);
});
