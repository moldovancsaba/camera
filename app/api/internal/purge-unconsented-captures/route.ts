/**
 * Erases captures whose guest never completed contact, and deletes captures whose required consent expired.
 * Contact-incomplete photos are private, unavailable to moderators/analytics/Fanmass from capture time, and erased
 * 24 hours after capture. The deletion leaves only event/time/method plus an aggregate deletion outcome.
 */

import { NextRequest } from 'next/server';
import { ObjectId, type Collection, type Db, type Document, type Filter } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { deleteSubmissionFiles } from '@/lib/submissions/delete-files';
import { finalizedGuestContactMongoFilter, hasFinalizedGuestContact } from '@/lib/submissions/guest-contact';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 40;
const ERASED_GUEST_CONTACT = { status: 'erased', source: null, name: null, email: null };

const erasureDue = (submission: Document, now: string): boolean =>
  (submission.erasure as Document | undefined)?.status === 'scheduled' &&
  typeof (submission.erasure as Document).deadlineAt === 'string' &&
  (submission.erasure as Document).deadlineAt <= now &&
  !hasFinalizedGuestContact(submission);

async function eraseIncompleteContactCapture(
  db: Db,
  submissions: Collection<Document>,
  submission: Document,
  now: string,
): Promise<'deleted' | 'retry' | 'skipped'> {
  // The capture is already excluded from all processing while scheduled. Claim again at deletion time so a
  // contact completion racing the deadline wins only if it atomically removed this scheduled erasure first.
  const claim = await submissions.updateOne(
    {
      _id: submission._id as ObjectId,
      'erasure.status': 'scheduled',
      'erasure.deadlineAt': { $lte: now },
      'guestContact.status': { $ne: 'complete' },
      $nor: [finalizedGuestContactMongoFilter],
    } as Filter<Document>,
    { $set: { 'erasure.status': 'deleting', isShareVisible: false, updatedAt: now } },
  );
  if (claim.modifiedCount !== 1) return 'skipped';

  try {
    const files = await deleteSubmissionFiles(db, submission);
    // A third-party ImgBB delete can fail while the source Blob delete succeeds. Keep the lifecycle blocked and
    // retry with the same source URLs on the next cron run; never mark erasure complete while a copy is reachable.
    if (files.imgbbFailed > 0) {
      await submissions.updateOne(
        { _id: submission._id, 'erasure.status': 'deleting' },
        { $set: { 'erasure.status': 'scheduled', 'erasure.lastAttemptAt': now, updatedAt: now } },
      );
      return 'retry';
    }

    await submissions.updateOne(
      { _id: submission._id, 'erasure.status': 'deleting' },
      {
        $set: {
          'erasure.status': 'complete',
          'erasure.completedAt': now,
          guestContact: { ...ERASED_GUEST_CONTACT, updatedAt: now },
          analyticsDeletion: 'automatic_no_login',
          metadata: { identityStatus: 'ERASED' },
          isShareVisible: false,
          reviewStatus: 'awaiting_contact',
          updatedAt: now,
        },
        $unset: {
          userId: '', userEmail: '', userName: '', userInfo: '', userInfoDraft: '',
          imageUrl: '', finalImageUrl: '', originalImageUrl: '', previewImageUrl: '', screenImageUrl: '', screenImageBytes: '',
          deleteUrl: '', imageId: '', imageCopies: '', fileSize: '', mimeType: '', photoReview: '',
          shareToken: '', people: '', peopleReview: '', reviewHistory: '', reviewNotes: '', rejectReasons: '',
          reviewedAt: '', reviewedBy: '', approvedAt: '', approvedBy: '', publicGalleryConsent: '', consents: '',
          fanmassIntakeByEvent: '', tryOnRequest: '',
          frameId: '', frameName: '', frameCategory: '', frameVariant: '', reframe: '',
          partnerId: '', partnerName: '', eventName: '',
          playCount: '', slideshowPlays: '', lastPlayedAt: '',
        },
      },
    );
    return 'deleted';
  } catch (error) {
    console.error(`Incomplete-contact capture erasure failed for ${String(submission._id)}`, error);
    await submissions.updateOne(
      { _id: submission._id, 'erasure.status': 'deleting' },
      { $set: { 'erasure.status': 'scheduled', 'erasure.lastAttemptAt': now, updatedAt: now } },
    );
    return 'retry';
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const check = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (check !== 'ok') {
    if (check === 'not_configured') console.warn('[internal-auth] capture cleanup: CRON_SECRET is not configured; cleanup stays disabled (fail closed)');
    else logSharedSecretRejection('capture cleanup', 'CRON_SECRET', check);
    throw apiForbidden();
  }

  const db = await connectToDatabase();
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const now = new Date().toISOString();
  const consentDueFilter = { consentStatus: 'pending', consentExpiresAt: { $lte: now } };
  const contactErasureDueFilter = {
    'erasure.status': 'scheduled',
    'erasure.deadlineAt': { $lte: now },
    'guestContact.status': { $ne: 'complete' },
    $nor: [finalizedGuestContactMongoFilter],
  };
  const due = await submissions
    .find({ $or: [consentDueFilter, contactErasureDueFilter] })
    .sort({ createdAt: 1 })
    .limit(BATCH_SIZE)
    .toArray();
  let deleted = 0;
  let erasedForNoContact = 0;
  let retried = 0;

  for (const submission of due) {
    if (erasureDue(submission, now)) {
      const result = await eraseIncompleteContactCapture(db, submissions, submission, now);
      if (result === 'deleted') {
        deleted += 1;
        erasedForNoContact += 1;
      } else if (result === 'retry') retried += 1;
      continue;
    }

    const galleryProof = (submission.publicGalleryConsent as { grantedAt?: unknown } | undefined)?.grantedAt;
    const hasAcceptedRecord = Array.isArray(submission.consents) && submission.consents.some((record) => (record as { accepted?: unknown })?.accepted === true);
    const consentArrived = typeof galleryProof === 'string' || (submission.consentPendingReason !== 'gallery' && hasAcceptedRecord);
    if (consentArrived) {
      await submissions.updateOne(
        { _id: submission._id, consentStatus: 'pending', consentExpiresAt: { $lte: now } },
        {
          $set: { consentStatus: 'received', isShareVisible: submission.consentShareOptIn === true, updatedAt: now },
          $unset: { consentExpiresAt: '', consentPendingReason: '', consentShareOptIn: '' },
        },
      );
      continue;
    }

    // Claim atomically so a consent submitted at the deadline wins over cleanup.
    const consentStillMissing = submission.consentPendingReason === 'gallery'
      ? { 'publicGalleryConsent.grantedAt': { $exists: false } }
      : { consents: { $not: { $elemMatch: { accepted: true } } }, 'publicGalleryConsent.grantedAt': { $exists: false } };
    const claim = await submissions.updateOne({ ...consentDueFilter, ...consentStillMissing, _id: submission._id as ObjectId } as Filter<Document>, {
      $set: { consentStatus: 'expiring', updatedAt: now },
    });
    if (claim.modifiedCount !== 1) continue;

    try {
      const files = await deleteSubmissionFiles(db, submission);
      if (files.imgbbFailed > 0) {
        await submissions.updateOne({ _id: submission._id, consentStatus: 'expiring' }, { $set: { consentStatus: 'pending', updatedAt: now } });
        retried += 1;
        continue;
      }
      await submissions.updateOne(
        { _id: submission._id, consentStatus: 'expiring' },
        {
          $set: {
            consentStatus: 'expired',
            consentExpiredAt: now,
            analyticsDeletion: hasFinalizedGuestContact(submission) ? 'automatic_other' : 'automatic_no_login',
            isShareVisible: false,
            'metadata.consentExpiredForLackOfConsent': true,
            'metadata.consentExpiredAt': now,
            updatedAt: now,
          },
          $unset: {
            imageUrl: '', finalImageUrl: '', originalImageUrl: '', previewImageUrl: '', screenImageUrl: '',
            deleteUrl: '', imageId: '', imageCopies: '', consentShareOptIn: '', 'photoReview.photoUrl': '',
            'tryOnRequest.sourceImageUrl': '', 'tryOnRequest.sourceDeleteUrl': '',
          },
        },
      );
      deleted += 1;
    } catch (error) {
      console.error(`Unconsented capture cleanup failed for ${String(submission._id)}`, error);
      await submissions.updateOne({ _id: submission._id, consentStatus: 'expiring' }, { $set: { consentStatus: 'pending', updatedAt: now } });
      retried += 1;
    }
  }

  return apiSuccess({ examined: due.length, deleted, erasedForNoContact, retried });
});
