import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SessionSigningKeyMissingError,
  serializeSignedSession,
  verifySignedSession,
} from './session-signing';

const KEY = 'test-signing-key-0123456789';

function sampleSession() {
  return {
    user: { id: 'user-1', email: 'person@example.com' },
    accessToken: 'access',
    refreshToken: 'refresh',
    accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: '2029-12-01T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
    appRole: 'user' as const,
    appAccess: true,
  };
}

test('round-trip: a signed session verifies and comes back without the signature field', () => {
  const wire = serializeSignedSession(sampleSession(), KEY);
  const back = verifySignedSession<Record<string, unknown>>(JSON.parse(wire), KEY);
  assert.ok(back);
  assert.equal(back.appRole, 'user');
  assert.equal('sig' in back, false);
  assert.deepEqual(back, sampleSession());
});

test('forged role: editing appRole after signing is rejected', () => {
  const wire = JSON.parse(serializeSignedSession(sampleSession(), KEY));
  wire.appRole = 'superadmin';
  assert.equal(verifySignedSession(wire, KEY), null);
});

test('unsigned legacy cookie is rejected, not grandfathered', () => {
  assert.equal(verifySignedSession({ ...sampleSession(), appRole: 'superadmin' }, KEY), null);
  assert.equal(verifySignedSession({ ...sampleSession(), sig: '' }, KEY), null);
});

test('a cookie signed with another key is rejected', () => {
  const wire = JSON.parse(serializeSignedSession(sampleSession(), 'other-key'));
  assert.equal(verifySignedSession(wire, KEY), null);
});

test('no signing key: cannot issue a plain cookie, cannot accept one', () => {
  assert.throws(() => serializeSignedSession(sampleSession(), null), SessionSigningKeyMissingError);
  const wire = JSON.parse(serializeSignedSession(sampleSession(), KEY));
  assert.equal(verifySignedSession(wire, null), null);
});

test('non-object cookie values are rejected', () => {
  assert.equal(verifySignedSession('string', KEY), null);
  assert.equal(verifySignedSession(null, KEY), null);
  assert.equal(verifySignedSession(42, KEY), null);
});
