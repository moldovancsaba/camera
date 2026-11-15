import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSubmissionIdentity } from './submission-identity';

test('merged guest photos and signed-in photos resolve to one canonical account', () => {
  const signedIn = resolveSubmissionIdentity({
    _id: 'real-photo', userId: 'sso-user', userEmail: 'real@example.com', userName: 'Real User',
    userInfo: { email: 'real@example.com', name: 'Real User' },
  });
  const mergedGuest = resolveSubmissionIdentity({
    _id: 'guest-photo', userId: 'sso-user', userEmail: 'real@example.com', userName: 'Real User',
    userInfo: { email: 'pseudo@example.com', name: 'Guest Name', mergedWith: 'sso-user' },
  });

  assert.equal(signedIn.key, 'account:sso-user');
  assert.equal(mergedGuest.key, signedIn.key);
  assert.deepEqual([mergedGuest.email, mergedGuest.name, mergedGuest.mergedWith], ['real@example.com', 'Real User', 'sso-user']);
});

test('a submission-only guest stays separate until it is linked to an account', () => {
  const identity = resolveSubmissionIdentity({ userId: 'anonymous', userEmail: 'guest@example.com', userInfo: { email: 'Guest@Example.com', name: 'Guest' } });
  assert.equal(identity.key, 'pseudo:guest@example.com');
  assert.equal(identity.isPseudo, true);
  assert.equal(identity.accountId, null);
});

test('anonymous captures do not become pseudo identities', () => {
  const identity = resolveSubmissionIdentity({ userId: 'anonymous', userEmail: 'anonymous@event' });
  assert.equal(identity.isAnonymous, true);
  assert.equal(identity.isPseudo, false);
});
