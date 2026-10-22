import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_AUDIT_ERASURE_STATUSES, requiresConsentAuditErasure } from './consent-eligibility';

const validAudit = [{
  pageId: 'terms',
  pageType: 'accept',
  checkboxText: 'I agree',
  accepted: true,
  acceptedAt: '2026-10-22T00:00:00.000Z',
}];

describe('consent audit erasure eligibility', () => {
  it('includes legacy received and expired states', () => {
    assert.deepEqual(CONSENT_AUDIT_ERASURE_STATUSES, ['received', 'expired']);
    for (const consentStatus of CONSENT_AUDIT_ERASURE_STATUSES) {
      assert.equal(requiresConsentAuditErasure({ consentStatus, consents: [] }), true);
      assert.equal(requiresConsentAuditErasure({ consentStatus, consents: validAudit }), false);
    }
  });

  it('does not bypass the 24-hour pending-consent window', () => {
    assert.equal(requiresConsentAuditErasure({ consentStatus: 'pending', consents: [] }), false);
    assert.equal(requiresConsentAuditErasure({ consentStatus: 'expiring', consents: [] }), false);
  });
});
