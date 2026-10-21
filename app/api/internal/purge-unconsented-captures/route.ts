/** Erase captures with no identity, missing required consent, or an unverifiable consent audit after 24 hours. */

import { NextRequest } from 'next/server';
import { ObjectId, type Db, type Document } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { deleteSubmissionFiles } from '@/lib/submissions/delete-files';
import { eventGetsDefaults, getDefaultsRollout, type DefaultsRolloutSettings } from '@/lib/admin/defaults-rollout';
import { CONSENT_UNKNOWN_FILTER } from '@/lib/events/consent-eligibility';
import { missingRequiredConsent } from '@/lib/events/consent-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 40;
const STALE_ERASURE_AFTER_MS = 30 * 60 * 1000;
const CONSENT_HOLD_MS = 24 * 60 * 60 * 1000;

/** A status-less row is consented only when its saved, timestamped audit satisfies the event's current required-consent rules. */
async function hasVerifiedConsentAudit(
  db: Db,
  submission: Document,
  rollout: DefaultsRolloutSettings,
  eventCache: Map<string, { event: Document | null; partner: Document | null }>,
): Promise<boolean> {
  if (!Array.isArray(submission.consents) || submission.consents.length === 0 || typeof submission.eventId !== 'string') return false;
  const records = submission.consents as Document[];
  if (!records.every((record) => typeof record.pageId === 'string'
    && record.pageId.length > 0
    && typeof record.checkboxText === 'string'
    && record.checkboxText.trim().length > 0
    && typeof record.accepted === 'boolean'
    && typeof record.acceptedAt === 'string'
    && Number.isFinite(Date.parse(record.acceptedAt)))) return false;

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
  const consentHoldCutoff = new Date(Date.now() - CONSENT_HOLD_MS).toISOString();
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
  const due = await submissions.find({ $or: [identityDueFilter, consentDueFilter, unknownConsentFilter] })
    .sort({ retentionExpiresAt: 1, consentExpiresAt: 1, createdAt: 1 }).limit(BATCH_SIZE).toArray();
  let deleted = 0;
  let erasedNoIdentity = 0;
  let erasedNoConsent = 0;
  let reconciledLegacyConsent = 0;
  let retried = 0;

  for (const submission of due) {
    const isConsentUnknown = submission.consentStatus !== 'pending'
      && submission.consentStatus !== 'expiring'
      && submission.consentStatus !== 'received'
      && submission.consentStatus !== 'expired';
    let noConsentAudit = submission.metadata?.consentAuditMissing === true;
    let unknownConsentAlreadyClaimed = false;

    if (isConsentUnknown) {
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

      const createdAtMs = typeof submission.createdAt === 'string' ? Date.parse(submission.createdAt) : Number.NaN;
      const objectIdCreatedAtMs = submission._id instanceof ObjectId ? submission._id.getTimestamp().getTime() : Number.NaN;
      const effectiveCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : objectIdCreatedAtMs;
      const olderThanHold = !Number.isFinite(effectiveCreatedAtMs) || effectiveCreatedAtMs <= Date.parse(consentHoldCutoff);
      if (!olderThanHold) continue;

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
              updatedAt: now,
            },
            $unset: {
              userInfo: '', consents: '', publicGalleryConsent: '', consentShareOptIn: '', consentExpiresAt: '', consentPendingReason: '',
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
