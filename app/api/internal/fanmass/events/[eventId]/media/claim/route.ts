import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { WithId } from 'mongodb';
import { apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { buildMediaFeedEligibilityMatch, FANMASS_MEDIA_JOBS_CONTRACT } from '@/lib/fanmass/media-feed';

const LEASE_MS = 10 * 60 * 1000;
const MAX_CLAIMS = 5;

/** Claim eligible, already-visible originals. Claiming is independent of review decisions. */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const { eventId } = await context.params;
  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId });
  if (!event || event.isActive === false) return apiSuccess({ contractVersion: FANMASS_MEDIA_JOBS_CONTRACT, eventId, jobs: [] });

  let requested = MAX_CLAIMS;
  try {
    const body = await request.json();
    if (Number.isFinite(Number(body?.limit))) requested = Math.max(1, Math.min(MAX_CLAIMS, Math.floor(Number(body.limit))));
  } catch {
    // An empty body means the server's bounded default.
  }

  const submissions = db.collection<Submission>(COLLECTIONS.SUBMISSIONS);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  const jobs = [];

  for (let index = 0; index < requested; index += 1) {
    const leaseToken = randomUUID();
    const lease: NonNullable<Submission['fanmassIntakeByEvent']>[number] = {
      eventId,
      status: 'claimed',
      leaseToken,
      leaseUntil,
      claimedAt: nowIso,
      updatedAt: nowIso,
      attempts: 1,
    };
    // Use separate atomic branches for a first-time event claim and a retry. A
    // submission can appear in multiple events, so each event owns its own lease.
    let candidate: WithId<Submission> | null = null;
    candidate = await submissions.findOneAndUpdate(
      {
        $and: [
          buildMediaFeedEligibilityMatch(eventId),
          { fanmassIntakeByEvent: { $not: { $elemMatch: { eventId } } } },
        ],
      },
      { $push: { fanmassIntakeByEvent: lease } },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
    );

    if (!candidate) {
      candidate = await submissions.findOneAndUpdate(
        {
          $and: [
            buildMediaFeedEligibilityMatch(eventId),
            {
              fanmassIntakeByEvent: {
                $elemMatch: {
                  eventId,
                  $or: [
                    {
                      status: 'queued',
                      $or: [
                        { retryAfter: { $exists: false } },
                        { retryAfter: { $lte: nowIso } },
                      ],
                    },
                    { status: 'claimed', leaseUntil: { $lte: nowIso } },
                  ],
                },
              },
            },
          ],
        },
        {
          $set: {
            'fanmassIntakeByEvent.$.status': 'claimed',
            'fanmassIntakeByEvent.$.leaseToken': leaseToken,
            'fanmassIntakeByEvent.$.leaseUntil': leaseUntil,
            'fanmassIntakeByEvent.$.claimedAt': nowIso,
            'fanmassIntakeByEvent.$.updatedAt': nowIso,
          },
          $unset: {
            'fanmassIntakeByEvent.$.retryAfter': '',
            'fanmassIntakeByEvent.$.lastErrorCode': '',
          },
          $inc: { 'fanmassIntakeByEvent.$.attempts': 1 },
        },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
      );
    }
    if (!candidate) break;
    jobs.push({
      captureId: candidate.submissionId,
      createdAt: candidate.approvedAt || candidate.createdAt,
      fetchPath: `/api/internal/fanmass/events/${encodeURIComponent(eventId)}/media/${encodeURIComponent(candidate.submissionId)}`,
      leaseToken,
      leaseUntil,
    });
  }

  return apiSuccess({ contractVersion: FANMASS_MEDIA_JOBS_CONTRACT, eventId, jobs });
});
