/**
 * The weekly archive of the activity log (issue 517): mails everything written since the previous export as a CSV to the owner, then deletes the records the previous export carried
 * (lib/activity/export.ts). Called by the weekly cron of vercel.json with Vercel's `Authorization: Bearer <CRON_SECRET>`; fails closed (403) when CRON_SECRET is not set on the
 * project (the owner's step, RUNBOOK). The same export can be started by a global admin with "Send now" (POST /api/admin/activity-log).
 */

import { NextRequest } from 'next/server';
import { apiError, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendEmail } from '@/lib/email/send';
import { ACTIVITY_EXPORT_DEFAULT_TO, exportActivity } from '@/lib/activity/export';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const check = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (check !== 'ok') {
    if (check === 'not_configured') console.warn('[internal-auth] activity export cron: CRON_SECRET is not configured; the weekly export stays disabled (fail closed)');
    else logSharedSecretRejection('activity export cron', 'CRON_SECRET', check);
    throw apiForbidden();
  }
  const db = await connectToDatabase();
  const result = await exportActivity(db, { send: sendEmail, now: () => new Date(), to: process.env.ACTIVITY_EXPORT_TO?.trim() || ACTIVITY_EXPORT_DEFAULT_TO });
  if (!result.ok) return apiError(`The activity log could not be mailed: ${result.error}`, 502);
  return apiSuccess(result);
});
