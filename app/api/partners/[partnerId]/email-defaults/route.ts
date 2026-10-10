/**
 * The e-mail defaults of a partner (epic 463, issue 559; the brick model: the event's own choice, else its partner's, else the standard, nothing copied down): today the switch of the follow-up
 * e-mail a week after the event for the partner's events that made no choice. The standard is off, so no event sends it until somebody chooses.
 *
 * GET /api/partners/<mongo id>/email-defaults   { name, followUp } the stored choice: true, false, or null (none: the events follow the standard, off) (viewer)
 * PUT /api/partners/<mongo id>/email-defaults   { followUp } true or false; null or "" takes the choice away (manager)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { savePartnerFollowUp } from '@/lib/email/follow-up';
import { parseFollowUpDefault } from '@/lib/email/follow-up-rules';

type Context = { params: Promise<{ partnerId: string }> };

const stored = (partner: { followUpEmail?: unknown }): boolean | null => (typeof partner.followUpEmail === 'boolean' ? partner.followUpEmail : null);

export const GET = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  return apiSuccess({ name: String(partner.name ?? ''), followUp: stored(partner) });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: Context) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const body = (await request.json().catch(() => null)) as { followUp?: unknown } | null;
  if (!body || !('followUp' in body)) throw apiBadRequest('The body must be JSON: { followUp }');
  const parsed = parseFollowUpDefault(body.followUp);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  if (!(await savePartnerFollowUp(db, String(partner.partnerId), parsed.value, generateTimestamp()))) throw apiNotFound('Partner');
  return apiSuccess({ name: String(partner.name ?? ''), followUp: parsed.value });
});
