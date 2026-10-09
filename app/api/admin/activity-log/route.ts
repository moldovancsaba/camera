/**
 * The activity log, for global admins (issue 517; lib/activity/*).
 *
 * GET  /api/admin/activity-log   -> { waiting, kept, lastExport, to }   (counts, writes nothing): the records written since the last export, all that are kept, the last export, the address
 * POST /api/admin/activity-log   -> the export now (the same as the weekly cron): mails the CSV and deletes the records of the previous export
 */

import { NextRequest } from 'next/server';
import { apiError, apiForbidden, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendEmail } from '@/lib/email/send';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { ACTIVITY_EXPORT_DEFAULT_TO, exportActivity } from '@/lib/activity/export';

export const maxDuration = 60;

const recipient = () => process.env.ACTIVITY_EXPORT_TO?.trim() || ACTIVITY_EXPORT_DEFAULT_TO;

async function admin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  const db = await connectToDatabase();
  const last = await db.collection(COLLECTIONS.ACTIVITY_EXPORTS).findOne({}, { sort: { toAt: -1 } });
  const lastAt = typeof last?.toAt === 'string' ? last.toAt : null;
  const [waiting, kept] = await Promise.all([db.collection(COLLECTIONS.ACTIVITY_LOG).countDocuments(lastAt ? { at: { $gt: lastAt } } : {}), db.collection(COLLECTIONS.ACTIVITY_LOG).countDocuments({})]);
  return apiSuccess({ waiting, kept, lastExport: last ? { sentAt: last.sentAt ?? null, toAt: lastAt, rows: last.rows ?? 0 } : null, to: recipient() });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await admin(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const db = await connectToDatabase();
  const result = await exportActivity(db, { send: sendEmail, now: () => new Date(), to: recipient() });
  if (!result.ok) return apiError(`The activity log could not be mailed: ${result.error}`, 502);
  return apiSuccess(result);
});
