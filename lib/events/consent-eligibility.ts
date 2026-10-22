import type { Document } from 'mongodb';

/** Validate every saved audit row before a received photo can enter a protected workflow. */
export function hasVerifiableConsentAudit(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    const accepted = record.accepted === true || (record.accepted === false && record.required === false);
    return typeof record.pageId === 'string'
      && record.pageId.trim().length > 0
      && (record.pageType === 'accept' || record.pageType === 'cta')
      && typeof record.checkboxText === 'string'
      && record.checkboxText.trim().length > 0
      && accepted
      && typeof record.acceptedAt === 'string'
      && Number.isFinite(Date.parse(record.acceptedAt));
  });
}

/** A received status without its timestamped audit is not permission to process. */
export function hasConsentEvidenceForProcessing(submission: Record<string, unknown>): boolean {
  return submission.consentStatus === 'received' && hasVerifiableConsentAudit(submission.consents);
}

export const CONSENT_AUDIT_ERASURE_STATUSES = ['received', 'expired'] as const;

/** A received or expired legacy status without its proof must be erased, not trusted. */
export function requiresConsentAuditErasure(submission: Record<string, unknown>): boolean {
  return (CONSENT_AUDIT_ERASURE_STATUSES as readonly unknown[]).includes(submission.consentStatus)
    && !hasVerifiableConsentAudit(submission.consents);
}

/** Mongo check for a structurally usable, timestamped consent audit on every recorded consent row. */
export const CONSENT_AUDIT_VALID_FILTER: Document = {
  $expr: {
    $and: [
      { $isArray: '$consents' },
      { $gt: [{ $size: { $cond: [{ $isArray: '$consents' }, '$consents', []] } }, 0] },
      {
        $allElementsTrue: {
          $map: {
            input: { $cond: [{ $isArray: '$consents' }, '$consents', []] },
            as: 'consent',
            in: {
              $and: [
                { $cond: [{ $eq: [{ $type: '$$consent.pageId' }, 'string'] }, { $ne: [{ $trim: { input: '$$consent.pageId' } }, ''] }, false] },
                { $in: ['$$consent.pageType', ['accept', 'cta']] },
                { $cond: [{ $eq: [{ $type: '$$consent.checkboxText' }, 'string'] }, { $ne: [{ $trim: { input: '$$consent.checkboxText' } }, ''] }, false] },
                {
                  $cond: [
                    { $eq: [{ $type: '$$consent.acceptedAt' }, 'string'] },
                    { $ne: [{ $dateFromString: { dateString: '$$consent.acceptedAt', onError: null, onNull: null } }, null] },
                    false,
                  ],
                },
                {
                  $or: [
                    { $eq: ['$$consent.accepted', true] },
                    { $and: [{ $eq: ['$$consent.accepted', false] }, { $eq: ['$$consent.required', false] }] },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
  },
};

/** Mongo equivalent used by vetting, analytics, and queues. Never infer consent from a status alone. */
export const CONSENT_ELIGIBLE_FILTER: Document = {
  $and: [{ consentStatus: 'received' }, CONSENT_AUDIT_VALID_FILTER],
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
