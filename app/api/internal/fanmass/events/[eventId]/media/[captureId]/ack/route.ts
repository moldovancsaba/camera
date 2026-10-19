import { NextRequest } from 'next/server';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';

/** Acknowledge only after Fanmass has durably queued the photo for analysis. */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string; captureId: string }> },
) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const { eventId, captureId } = await context.params;
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw apiBadRequest('A lease token and outcome are required.');
  }
  if (!parsed || typeof parsed !== 'object') throw apiBadRequest('A lease token and outcome are required.');
  const body = parsed as { leaseToken?: unknown; outcome?: unknown; errorCode?: unknown };

  const leaseToken = typeof body.leaseToken === 'string' ? body.leaseToken : '';
  const outcome = body.outcome;
  if (!leaseToken || (outcome !== 'staged' && outcome !== 'retry' && outcome !== 'failed')) {
    throw apiBadRequest('A lease token and valid outcome are required.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const errorCode = typeof body.errorCode === 'string' ? body.errorCode.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) : '';
  const submissions = (await connectToDatabase()).collection(COLLECTIONS.SUBMISSIONS);
  const claimFilter = {
    $or: [{ eventId }, { eventIds: eventId }],
    submissionId: captureId,
    fanmassIntakeByEvent: { $elemMatch: { eventId, status: 'claimed', leaseToken } },
  };
  const claim = await submissions.findOne(claimFilter, { projection: { fanmassIntakeByEvent: 1 } });
  if (!claim) throw apiNotFound('Active Fanmass media claim');
  const attempts = Math.max(1, Number(claim.fanmassIntakeByEvent?.find((item) => item.eventId === eventId)?.attempts) || 1);
  const backoffMs = Math.min(30 * 60_000, 30_000 * (2 ** Math.min(attempts - 1, 6)));
  const retryAfter = new Date(now.getTime() + backoffMs).toISOString();
  const set = outcome === 'staged'
    ? { 'fanmassIntakeByEvent.$[intake].status': 'staged', 'fanmassIntakeByEvent.$[intake].stagedAt': nowIso, 'fanmassIntakeByEvent.$[intake].updatedAt': nowIso }
    : outcome === 'failed'
      ? {
          'fanmassIntakeByEvent.$[intake].status': 'failed',
          'fanmassIntakeByEvent.$[intake].lastErrorCode': errorCode || 'media_rejected',
          'fanmassIntakeByEvent.$[intake].updatedAt': nowIso,
        }
    : {
        'fanmassIntakeByEvent.$[intake].status': 'queued',
        'fanmassIntakeByEvent.$[intake].retryAfter': retryAfter,
        'fanmassIntakeByEvent.$[intake].lastErrorCode': errorCode || 'intake_retry',
        'fanmassIntakeByEvent.$[intake].updatedAt': nowIso,
      };
  const result = await submissions.updateOne(
    claimFilter,
    {
      $set: set,
      $unset: {
        'fanmassIntakeByEvent.$[intake].leaseToken': '',
        'fanmassIntakeByEvent.$[intake].leaseUntil': '',
        ...(outcome === 'staged'
          ? {
              'fanmassIntakeByEvent.$[intake].retryAfter': '',
              'fanmassIntakeByEvent.$[intake].lastErrorCode': '',
            }
          : {}),
      },
    },
    { arrayFilters: [{ 'intake.eventId': eventId, 'intake.status': 'claimed', 'intake.leaseToken': leaseToken }] },
  );

  if (result.modifiedCount !== 1) throw apiNotFound('Active Fanmass media claim');
  return apiSuccess({ eventId, captureId, status: outcome });
});
