/** Erase captures after identity retention expires, missing required consent, or an unverifiable consent audit. */

import { NextRequest } from 'next/server';
import { ObjectId, type Db, type Document } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { deleteSubmissionFiles } from '@/lib/submissions/delete-files';
import { eventGetsDefaults, getDefaultsRollout, type DefaultsRolloutSettings } from '@/lib/admin/defaults-rollout';
import { CONSENT_AUDIT_VALID_FILTER, CONSENT_UNKNOWN_FILTER, hasVerifiableConsentAudit } from '@/lib/events/consent-eligibility';
import { missingRequiredConsent } from '@/lib/events/consent-guard';
import { anonymousWithoutFinalContactMongoFilter, hasFinalizedGuestContact, incompleteContactErasure } from '@/lib/submissions/guest-contact';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 40;
const STALE_ERASURE_AFTER_MS = 30 * 60 * 1000;

async function hasVerifiedConsentAudit(
  db: Db,
  submission: Document,
  rollout: DefaultsRolloutSettings,
  eventCache: Map<string, { event: Document | null; partner: Document | null }>,
): Promise<boolean> {
  if (!hasVerifiableConsentAudit(submission.consents) || typeof submission.eventId !== 'string') return false;

  let config = eventCache.get(submission.eventId);
  if (!config) {
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: submission.eventId });
    const partner = event && typeof event.partnerId === 'string'
      ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId })
      : null;
    config = { event, partner };
    eventCache.set(submission.eventId, config);
  }
  const { event, partner } = config;
  if (!event) return false;
  if (typeof event.partnerId === 'string' && !partner) return false;

  return missingRequiredConsent(
    event,
    partner,
    {
      consents: submission.consents,
      shareOptIn: submission.consentShareOptIn,
      publicGalleryConsentVersion: (submission.publicGalleryConsent as Document | null)?.version,
    },
    {
      consentDefault: eventGetsDefaults(event, rollout),
      vettingRequired: (event.photoVetting as Document | undefined)?.required === true,
    },
    true,
  ) === null;
}

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
  const rollout = await getDefaultsRollout(db);
  const eventCache = new Map<string, { event: Document | null; partner: Document | null }>();
  const now = new Date().toISOString();
  const contactRetentionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleErasureBefore = new Date(Date.now() - STALE_ERASURE_AFTER_MS).toISOString();
  const consentDueFilter = {
    $or: [
      { consentStatus: 'pending', consentExpiresAt: { $lte: now } },
      {
        consentStatus: 'expiring',
        $or: [
          { 'metadata.consentErasureStartedAt': { $lte: staleErasureBefore } },
          { 'metadata.consentErasureStartedAt': { $exists: false } },
        ],
      },
    ],
    retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
  };
  const identityDueFilter = {
    $or: [
      { retentionStatus: 'pending_erasure', retentionExpiresAt: { $lte: now } },
      { retentionStatus: 'erasing', $or: [
        { retentionErasureStartedAt: { $lte: staleErasureBefore } },
        { retentionErasureStartedAt: { $exists: false } },
      ] },
    ],
  };
  const unknownConsentFilter = {
    $and: [
      CONSENT_UNKNOWN_FILTER,
      { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
    ],
  };
  const unverifiedReceivedConsentFilter = {
    consentStatus: 'received',
    $nor: [CONSENT_AUDIT_VALID_FILTER],
    retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
  };
  // Legacy anonymous captures predate the explicit 24-hour marker. Derive the
  // same deadline from createdAt, while excluding finalized contacts and admin uploads.
  const legacyNoContactDueFilter = {
    $and: [
      anonymousWithoutFinalContactMongoFilter,
      { createdAt: { $lte: contactRetentionCutoff } },
      { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
    ],
  };
  const due = await submissions.find({ $or: [identityDueFilter, legacyNoContactDueFilter, consentDueFilter, unknownConsentFilter, unverifiedReceivedConsentFilter] })
    .sort({ retentionExpiresAt: 1, consentExpiresAt: 1, createdAt: 1 }).limit(BATCH_SIZE).toArray();
  let deleted = 0;
  let erasedNoIdentity = 0;
  let erasedNoConsent = 0;
  let reconciledLegacyConsent = 0;
  let retried = 0;

  for (const submission of due) {
    const legacyNoContactDue = (submission.userId === 'anonymous' || !submission.userId)
      && submission.metadata?.adminGalleryUpload !== true
      && !hasFinalizedGuestContact(submission)
      && !['pending_erasure', 'erasing', 'erased'].includes(String(submission.retentionStatus || ''))
      && typeof submission.createdAt === 'string'
      && submission.createdAt <= contactRetentionCutoff;
    if (legacyNoContactDue) {
      const retention = incompleteContactErasure(submission.createdAt);
      const claim = await submissions.updateOne({
        _id: submission._id,
        $and: [
          anonymousWithoutFinalContactMongoFilter,
          { createdAt: { $lte: contactRetentionCutoff } },
          { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
        ],
      }, { $set: { retentionStatus: retention.status, retentionExpiresAt: retention.retentionExpiresAt, updatedAt: now } });
      if (claim.modifiedCount !== 1) continue;
      submission.retentionStatus = retention.status;
      submission.retentionExpiresAt = retention.retentionExpiresAt;
    }
    const isConsentUnknown = submission.consentStatus !== 'pending'
      && submission.consentStatus !== 'expiring'
      && submission.consentStatus !== 'received'
      && submission.consentStatus !== 'expired';
    let noConsentAudit = submission.metadata?.consentAuditMissing === true;
    let unknownConsentAlreadyClaimed = false;

    if (submission.consentStatus === 'received' && !hasVerifiableConsentAudit(submission.consents)) {
      // Older deployments could mark a capture as received even when the
      // evidence array was absent. Revoke that eligibility and erase the file.
      const claim = await submissions.updateOne({
        _id: submission._id,
        consentStatus: 'received',
        $nor: [CONSENT_AUDIT_VALID_FILTER],
        retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
      }, {
        $set: {
          consentStatus: 'expiring',
          'metadata.consentErasureStartedAt': now,
          'metadata.consentAuditMissing': true,
          isShareVisible: false,
          isSlideshowEligible: false,
          updatedAt: now,
        },
      });
      if (claim.modifiedCount !== 1) continue;
      submission.consentStatus = 'expiring';
      submission.metadata = { ...(submission.metadata ?? {}), consentAuditMissing: true };
      noConsentAudit = true;
      unknownConsentAlreadyClaimed = true;
    } else if (isConsentUnknown) {
      if (await hasVerifiedConsentAudit(db, submission, rollout, eventCache)) {
        const reconciled = await submissions.updateOne({
          _id: submission._id,
          $and: [CONSENT_UNKNOWN_FILTER, { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } }],
        }, {
          $set: { consentStatus: 'received', 'metadata.consentAuditVerifiedAt': now, updatedAt: now },
        });
        if (reconciled.modifiedCount === 1) reconciledLegacyConsent += 1;
        continue;
      }

      // A missing or unverifiable audit is not pending consent. Keep it private
      // and erase it on this cleanup pass; the separate 24-hour deadline applies
      // only to submissions explicitly saved as pending required consent.
      const claim = await submissions.updateOne({
        _id: submission._id,
        $and: [
          CONSENT_UNKNOWN_FILTER,
          { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
        ],
      }, {
        $set: {
          consentStatus: 'expiring',
          'metadata.consentErasureStartedAt': now,
          'metadata.consentAuditMissing': true,
          isShareVisible: false,
          isSlideshowEligible: false,
          updatedAt: now,
        },
      });
      if (claim.modifiedCount !== 1) continue;
      submission.consentStatus = 'expiring';
      submission.metadata = { ...(submission.metadata ?? {}), consentAuditMissing: true };
      noConsentAudit = true;
      unknownConsentAlreadyClaimed = true;
    }

    if (submission.retentionStatus === 'pending_erasure' || submission.retentionStatus === 'erasing') {
      // Claim the identity-erasure state atomically. A concurrent identity PATCH
      // or cleanup worker cannot make this photo visible while files are removed.
      const erasureClaim = submission.retentionStatus === 'pending_erasure'
        ? { _id: submission._id, retentionStatus: 'pending_erasure', retentionExpiresAt: { $lte: now } }
        : { _id: submission._id, retentionStatus: 'erasing', $or: [
            { retentionErasureStartedAt: { $lte: staleErasureBefore } },
            { retentionErasureStartedAt: { $exists: false } },
          ] };
      const claim = await submissions.updateOne(
        erasureClaim,
        { $set: { retentionStatus: 'erasing', retentionErasureStartedAt: now, isShareVisible: false, updatedAt: now } },
      );
      if (claim.modifiedCount !== 1) continue;
      try {
        const files = await deleteSubmissionFiles(db, submission);
        if (files.imgbbFailed > 0) {
          await submissions.updateOne(
            { _id: submission._id, retentionStatus: 'erasing', retentionErasureStartedAt: now },
            { $set: { retentionStatus: 'pending_erasure', updatedAt: now }, $unset: { retentionErasureStartedAt: '' } },
          );
          retried += 1;
          continue;
        }
        await submissions.updateOne(
          { _id: submission._id, retentionStatus: 'erasing', retentionErasureStartedAt: now },
          {
            $set: {
              retentionStatus: 'erased',
              retentionErasedAt: now,
              analyticsDeletion: 'automatic_no_login',
              userId: 'anonymous',
              userEmail: 'anonymous@event',
              userName: 'NO USER',
              isShareVisible: false,
              isSlideshowEligible: false,
              'metadata.identityStatus': 'NO USER',
              'metadata.retentionErasedAt': now,
              guestContact: { status: 'erased', source: null, name: null, email: null, updatedAt: now, completedAt: null },
              updatedAt: now,
            },
            $unset: {
              userInfo: '', userInfoDraft: '', consents: '', publicGalleryConsent: '', consentShareOptIn: '', consentExpiresAt: '', consentPendingReason: '',
              imageUrl: '', finalImageUrl: '', originalImageUrl: '', previewImageUrl: '', screenImageUrl: '',
              deleteUrl: '', imageId: '', imageCopies: '', photoReview: '', shareToken: '',
              people: '', peopleReview: '', reviewHistory: '', rejectReasons: '', reviewNotes: '', reviewedAt: '', reviewedBy: '', approvedAt: '', approvedBy: '',
              'tryOnRequest.sourceImageUrl': '', 'tryOnRequest.sourceDeleteUrl': '',
              'metadata.emailSkipReason': '', 'metadata.emailSentAfterSave': '', 'metadata.emailSentAfterRelatedPhotos': '',
              'metadata.emailFailedAt': '', 'metadata.emailError': '', 'metadata.emailMessageId': '',
              retentionExpiresAt: '', retentionErasureStartedAt: '',
            },
          },
        );
        erasedNoIdentity += 1;
        deleted += 1;
      } catch (error) {
        console.error(`No-identity capture erasure failed for ${String(submission._id)}`, error);
        await submissions.updateOne(
          { _id: submission._id, retentionStatus: 'erasing', retentionErasureStartedAt: now },
          { $set: { retentionStatus: 'pending_erasure', updatedAt: now }, $unset: { retentionErasureStartedAt: '' } },
        );
        retried += 1;
      }
      continue;
    }

    // `consentStatus` is changed to `received` only by the full required-consent
    // validator in the capture API. An arbitrary accepted record (for example,
    // optional marketing) is not proof that the required consent set is complete.
    // Claim atomically: if the guest's complete consent is saved first, this filter
    // no longer matches; if cleanup claims first, the consent API refuses the write.
    if (!unknownConsentAlreadyClaimed) {
      const consentErasureClaim = submission.consentStatus === 'pending'
        ? { _id: submission._id as ObjectId, consentStatus: 'pending', consentExpiresAt: { $lte: now } }
        : {
            _id: submission._id as ObjectId,
            consentStatus: 'expiring',
            $or: [
              { 'metadata.consentErasureStartedAt': { $lte: staleErasureBefore } },
              { 'metadata.consentErasureStartedAt': { $exists: false } },
            ],
          };
      const claim = await submissions.updateOne({
        ...consentErasureClaim,
        retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
      }, {
        $set: { consentStatus: 'expiring', 'metadata.consentErasureStartedAt': now, updatedAt: now },
      });
      if (claim.modifiedCount !== 1) continue;
    }

    try {
      const files = await deleteSubmissionFiles(db, submission);
      // ImgBB deletion is best-effort in the shared delete helper. Keep the source URLs and retry next run if it failed.
      if (files.imgbbFailed > 0) {
        if (!noConsentAudit) {
          await submissions.updateOne({ _id: submission._id, consentStatus: 'expiring', 'metadata.consentErasureStartedAt': now }, { $set: { consentStatus: 'pending', updatedAt: now }, $unset: { 'metadata.consentErasureStartedAt': '' } });
        }
        retried += 1;
        continue;
      }
      const completedAt = new Date().toISOString();
      const setFields: Document = noConsentAudit
        ? {
            consentStatus: 'expired',
            consentExpiredAt: completedAt,
            analyticsDeletion: 'automatic_other',
            retentionStatus: 'erased',
            retentionErasedAt: completedAt,
            guestContact: { status: 'erased', source: null, name: null, email: null, updatedAt: completedAt, completedAt: null },
            userId: 'anonymous',
            userEmail: 'anonymous@event',
            userName: 'NO USER',
            isShareVisible: false,
            isSlideshowEligible: false,
            metadata: {
              consentAuditMissing: true,
              consentAuditMissingAt: completedAt,
              consentExpiredForLackOfConsent: true,
              consentExpiredAt: completedAt,
            },
            updatedAt: completedAt,
          }
        : {
            consentStatus: 'expired',
            consentExpiredAt: completedAt,
            isShareVisible: false,
            isSlideshowEligible: false,
            'metadata.consentExpiredForLackOfConsent': true,
            'metadata.consentExpiredAt': completedAt,
            updatedAt: completedAt,
          };
      const unsetFields: Document = noConsentAudit
        ? {
            imageUrl: '', finalImageUrl: '', originalImageUrl: '', previewImageUrl: '', screenImageUrl: '', screenImageBytes: '',
            deleteUrl: '', imageId: '', imageCopies: '', consentShareOptIn: '',
            photoReview: '', people: '', peopleReview: '', fanmassAnalysisReview: '',
            frameVariant: '', reframe: '', shareToken: '',
            userInfo: '', userInfoDraft: '', consents: '', publicGalleryConsent: '',
            consentExpiresAt: '', consentPendingReason: '',
            reviewHistory: '', rejectReasons: '', reviewNotes: '', reviewedAt: '', reviewedBy: '', approvedAt: '', approvedBy: '',
            'tryOnRequest.sourceImageUrl': '', 'tryOnRequest.sourceDeleteUrl': '',
          }
        : {
            imageUrl: '', finalImageUrl: '', originalImageUrl: '', previewImageUrl: '', screenImageUrl: '',
            deleteUrl: '', imageId: '', imageCopies: '', consentShareOptIn: '', 'photoReview.photoUrl': '',
            people: '', peopleReview: '', fanmassAnalysisReview: '',
            'tryOnRequest.sourceImageUrl': '', 'tryOnRequest.sourceDeleteUrl': '',
            'metadata.consentErasureStartedAt': '',
          };
      await submissions.updateOne(
        { _id: submission._id, consentStatus: 'expiring', 'metadata.consentErasureStartedAt': now },
        {
          $set: setFields,
          $unset: unsetFields,
        },
      );
      if (noConsentAudit) erasedNoConsent += 1;
      deleted += 1;
    } catch (error) {
      console.error(`Unconsented capture cleanup failed for ${String(submission._id)}`, error);
      if (!noConsentAudit) {
        await submissions.updateOne({ _id: submission._id, consentStatus: 'expiring', 'metadata.consentErasureStartedAt': now }, { $set: { consentStatus: 'pending', updatedAt: now }, $unset: { 'metadata.consentErasureStartedAt': '' } });
      }
      retried += 1;
    }
  }

  return apiSuccess({ examined: due.length, deleted, erasedNoIdentity, erasedNoConsent, reconciledLegacyConsent, retried });
});
