/**
 * Admin User Merge API
 * POST /api/admin/users/merge
 * Resolves the real SSO user id from an active verified Camera session or an
 * existing active submission (no cross-service SSO database access).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { lookupSsoAccountByEmail } from '@/lib/sso/submission-account';
import { withErrorHandler } from '@/lib/api/withErrorHandler';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { guestEmailOf } from '@/lib/submissions/guest-contact';

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await requireAdmin();

    const body = await request.json();
    const pseudoEmail = guestEmailOf(body.pseudoEmail) ?? '';
    const realUserEmail = guestEmailOf(body.realUserEmail) ?? '';

    if (!pseudoEmail || !realUserEmail) {
      return NextResponse.json(
        { error: 'Both pseudoEmail and realUserEmail are required' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const account = await lookupSsoAccountByEmail(db, realUserEmail);

    if (account.status === 'ambiguous') {
      return NextResponse.json(
        { error: 'More than one SSO account has this verified email. No photos were changed; resolve the account identity before retrying.' },
        { status: 409 }
      );
    }

    if (account.status === 'not_found') {
      return NextResponse.json(
        {
          error: 'No active verified SSO account was found for this address. The account owner must sign in to Camera once; a photo submission is not required.',
        },
        { status: 404 }
      );
    }

    const realUserId = account.userId;

    const realUser = await db.collection(COLLECTIONS.SUBMISSIONS).findOne(
      { userId: realUserId, ...PRIVACY_ERASURE_ACTIVE_FILTER },
      { sort: { createdAt: -1 }, projection: { userEmail: 1, userName: 1 } }
    );

    const sourceEmail = new RegExp(`^${pseudoEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    // A merge source is a submission-only identity (or one already partially merged).
    // Do not capture an ordinary SSO submission merely because its contact email matches.
    const pseudoSourceQuery = {
      $and: [
        { 'userInfo.email': sourceEmail },
        PRIVACY_ERASURE_ACTIVE_FILTER,
        {
          $or: [
            { 'userInfo.mergedWith': { $exists: true, $nin: [null, ''] } },
            { userId: 'anonymous' },
            { userId: { $exists: false } },
            { userId: null },
            { userId: '' },
          ],
        },
      ],
    };
    const pseudoSubmissions = await db.collection(COLLECTIONS.SUBMISSIONS).find(pseudoSourceQuery).toArray();

    if (pseudoSubmissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found for pseudo user email' },
        { status: 404 }
      );
    }

    const mergedTargets = [...new Set(pseudoSubmissions
      .map((submission) => submission.userInfo?.mergedWith)
      .filter((value): value is string => typeof value === 'string' && value.length > 0))];
    if (mergedTargets.some((target) => target !== realUserId)) {
      return NextResponse.json(
        { error: 'Some photos are already linked to a different account. They were not changed.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const userEmail = account.email || realUser?.userEmail || realUserEmail;
    const userName = account.name || realUser?.userName || userEmail.split('@')[0];
    const alreadyLinked = pseudoSubmissions.filter((submission) => submission.userInfo?.mergedWith === realUserId).length;

    const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
      {
        $and: [
          pseudoSourceQuery,
          {
            $or: [
              { 'userInfo.mergedWith': { $exists: false } },
              { 'userInfo.mergedWith': null },
              { 'userInfo.mergedWith': '' },
            ],
          },
        ],
      },
      {
        $set: {
          userId: realUserId,
          userEmail,
          userName,
          'userInfo.mergedWith': realUserId,
          'userInfo.mergedAt': now,
          'userInfo.mergedBy': session.user.id,
          updatedAt: now,
        },
      }
    );

    const newlyLinked = result.modifiedCount;
    const submissionsMerged = alreadyLinked + newlyLinked;
    const message = newlyLinked === 0
      ? `${submissionsMerged} photos were already linked to ${userEmail}. No additional photos needed changes.`
      : `Linked ${newlyLinked} photos to ${userName} (${userEmail}). ${alreadyLinked} were already linked.`;
    console.log(`Merged pseudo submissions (${newlyLinked} new, ${alreadyLinked} already linked)`);

    return NextResponse.json({
      success: true,
      message,
      pseudoEmail,
      realUserEmail,
      realUserId,
      submissionsMerged,
      newlyLinked,
      alreadyLinked,
      mergedAt: now,
    });
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    console.error('Error merging users:', error);
    return NextResponse.json(
      {
        error: 'Failed to merge users',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
});
