/**
 * The follow-up e-mail by hand, for global admins (epic 463, issue 559, lib/email/follow-up.ts): the same run as the daily cron, started from the admin, with a dry run that only counts.
 *
 * GET  /api/admin/follow-up-emails                  -> { cronConfigured, minAgeDays, maxAgeDays, maxSendsPerRun } what the daily job does and whether it can run by itself (CRON_SECRET is set), reads nothing else
 * POST /api/admin/follow-up-emails { dryRun? }      -> the result of the run (lib/email/follow-up.ts `FollowUpResult`). **A dry run is the default**: it reads the events, photos and claims, writes nothing and
 *   sends nothing, and says how many e-mails there are to send. Only `{ "dryRun": false }` sends, at most FOLLOW_UP_MAX_SENDS_PER_RUN e-mails and for at most 40 seconds; press it again to continue.
 */

import { NextRequest } from 'next/server';
import { apiBadRequest, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { runFollowUps } from '@/lib/email/follow-up';
import { FOLLOW_UP_MAX_SENDS_PER_RUN, FOLLOW_UP_MIN_AGE_DAYS, followUpMaxAgeDays } from '@/lib/email/follow-up-rules';
import { sendSubmissionResultEmail } from '@/lib/email/submission-notification';
import { logInfo } from '@/lib/observability/logger';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 40_000;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
  return session;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  return apiSuccess({
    // Whether the daily job can run by itself: Vercel only sends the cron its secret when CRON_SECRET is set on the project (issue 529). The value is never sent.
    cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    minAgeDays: FOLLOW_UP_MIN_AGE_DAYS,
    maxAgeDays: followUpMaxAgeDays(process.env.FOLLOW_UP_MAX_AGE_DAYS),
    maxSendsPerRun: FOLLOW_UP_MAX_SENDS_PER_RUN,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown } | null;
  if (body && body.dryRun !== undefined && typeof body.dryRun !== 'boolean') throw apiBadRequest('dryRun must be true or false');
  // A request that does not say otherwise only counts.
  const dryRun = body?.dryRun !== false;
  const db = await connectToDatabase();
  const result = await runFollowUps(
    db,
    { send: sendSubmissionResultEmail, now: () => new Date(), maxAgeDays: followUpMaxAgeDays(process.env.FOLLOW_UP_MAX_AGE_DAYS), budgetMs: BUDGET_MS },
    { dryRun }
  );
  if (!dryRun) logInfo('follow_up.manual_run', 'An admin started the follow-up e-mails', { by: session.user.id, sent: result.sent, failed: result.failed, remaining: result.remaining });
  return apiSuccess(result);
});
