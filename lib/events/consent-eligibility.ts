import type { Document } from 'mongodb';

/** Only the submission-time or full required-consent check can mark a photo as received. Status-less rows stay held until consent is verified. */
export function hasConsentEvidenceForProcessing(submission: Record<string, unknown>): boolean {
  return submission.consentStatus === 'received';
}

/** Mongo equivalent of the same rule for queues and atomic writes. Do not infer a complete consent set from one accepted record. */
export const CONSENT_ELIGIBLE_FILTER: Document = {
  consentStatus: 'received',
};

/** Records still eligible for the 24-hour hold/cleanup count; erased records are no longer pending. */
export const CONSENT_PENDING_FILTER: Document = {
  consentStatus: { $in: ['pending', 'expiring'] },
};

/** Captures whose required-consent window elapsed and whose image was erased. */
export const CONSENT_EXPIRED_FILTER: Document = {
  consentStatus: 'expired',
};

/** Legacy or malformed consent state is not proof of consent and remains excluded until verified. */
export const CONSENT_UNKNOWN_FILTER: Document = {
  $or: [
    { consentStatus: { $exists: false } },
    { consentStatus: null },
    { consentStatus: '' },
  ],
};
