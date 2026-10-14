/** Delete photos whose required consent was never provided within 24 hours. */

import { NextRequest } from 'next/server';
import { ObjectId, type Document, type Filter } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { deleteSubmissionFiles } from '@/lib/submissions/delete-files';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 40;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const check = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (check !== 'ok') {
    if (check === 'not_configured') console.warn('[internal-auth] unconsented capture cleanup: CRON_SECRET is not configured; cleanup stays disabled (fail closed)');
    else logSharedSecretRejection('unconsented capture cleanup', 'CRON_SECRET', check);
    throw apiForbidden();
  }

  const db = await connectToDatabase();
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const now = new Date().toISOString();
  const dueFilter = {
    consentStatus: 'pending',
    consentExpiresAt: { $lte: now },
  };
  const due = await submissions.find(dueFilter).sort({ consentExpiresAt: 1 }).limit(BATCH_SIZE).toArray();
  let deleted = 0;
  let retried = 0;

  for (const submission of due) {
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
    const claim = await submissions.updateOne({ ...dueFilter, ...consentStillMissing, _id: submission._id as ObjectId } as Filter<Document>, {
      $set: { consentStatus: 'expiring', updatedAt: now },
    });
    if (claim.modifiedCount !== 1) continue;

    try {
      const files = await deleteSubmissionFiles(db, submission);
      // ImgBB deletion is best-effort in the shared delete helper. Keep the source URLs and retry next run if it failed.
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

  return apiSuccess({ examined: due.length, deleted, retried });
});
