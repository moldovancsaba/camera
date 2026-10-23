import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { buildEmailConflictFilter, buildSubjectMatchFilter, createResolverCursor, normalizedVerifiedEmail, readResolverCursor, toCameraPhotoMatch } from './subject-resolver';
import type { SsoSubjectProof } from './subject-proof';

const accountProof = (overrides: Partial<SsoSubjectProof> = {}): SsoSubjectProof => ({
  version: 1,
  caseId: 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab',
  subject: { kind: 'sso_user', id: 'sso-account-17' },
  ...overrides,
});

test('account resolution uses exact participant fields and never queries reviewer data', () => {
  const proof = accountProof({ verifiedEmail: { value: 'Guest@Example.com', proof: 'sso_account_email_verified', verifiedAt: null } });
  const filter = buildSubjectMatchFilter(proof)!;
  const serialized = JSON.stringify(filter);
  assert.match(serialized, /sso-account-17/);
  assert.match(serialized, /\^sso-account-17\$/);
  assert.match(serialized, /guestContact\.email/);
  assert.match(serialized, /userInfo\.email/);
  assert.match(serialized, /userEmail/);
  assert.doesNotMatch(serialized, /reviewedBy|approvedBy|rejectedBy|reviewHistory|reviewNotes|anonymous@event/);
  assert.equal(normalizedVerifiedEmail(proof), 'guest@example.com');
});

test('legacy top-level email lookup excludes anonymous and unfinished-contact records', () => {
  const filter = buildSubjectMatchFilter(accountProof({ verifiedEmail: { value: 'guest@example.com', proof: 'sso_account_email_verified', verifiedAt: null } }))!;
  const branches = filter.$or as Array<Record<string, unknown>>;
  const legacy = branches[3].$and as Array<Record<string, unknown>>;
  const excludedIds = legacy.find((clause) => Array.isArray(clause.$nor))?.$nor as Array<{ userId: RegExp }>;
  assert.match(JSON.stringify(filter), /userInfoDraft/);
  assert.match(JSON.stringify(filter), /guestContact/);
  assert.equal(excludedIds[0].userId.source, '^$');
  assert.equal(excludedIds[1].userId.source, '^anonymous$');
});

test('placeholder proof email is ignored and cannot identify photos', () => {
  const proof = accountProof({ verifiedEmail: { value: 'anonymous@event.com', proof: 'sso_account_email_verified', verifiedAt: null } });
  assert.equal(normalizedVerifiedEmail(proof), null);
  assert.equal(buildEmailConflictFilter(proof), null);
  assert.doesNotMatch(JSON.stringify(buildSubjectMatchFilter(proof)), /anonymous@event/);
});

test('email conflict query only catches a competing stable account', () => {
  const filter = buildEmailConflictFilter(accountProof({ verifiedEmail: { value: 'guest@example.com', proof: 'sso_account_email_verified', verifiedAt: null } }))!;
  const excludedIds = filter.$nor as Array<{ userId: RegExp }>;
  assert.equal(excludedIds[2].userId.source, '^sso-account-17$');
  assert.doesNotMatch(JSON.stringify(filter), /review/);
});

test('photo DTO contains opaque product references only', () => {
  const raw = new ObjectId();
  const result = toCameraPhotoMatch({ _id: raw, submissionId: 'submission-uuid', eventId: 'e-1', eventIds: ['e-2', 'e-1'], partnerId: 'p-1', userId: 'sso-account-17', userEmail: 'guest@example.com' }, 'sso-account-17');
  assert.deepEqual(result, { photo_id: raw.toHexString(), submission_id: 'submission-uuid', event_ids: ['e-1', 'e-2'], partner_id: 'p-1', basis: 'sso_account_id' });
  assert.equal(JSON.stringify(result).includes('guest@example.com'), false);
});

test('signed resolver cursor is case-bound and rejects tampering', () => {
  const cursor = createResolverCursor({ caseId: 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab', through: '507f1f77bcf86cd799439011', after: '507f1f77bcf86cd799439010' }, 'test-resolver-secret');
  assert.deepEqual(readResolverCursor(cursor, 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab', 'test-resolver-secret'), {
    caseId: 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab', through: '507f1f77bcf86cd799439011', after: '507f1f77bcf86cd799439010',
  });
  assert.equal(readResolverCursor(cursor, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test-resolver-secret'), null);
  assert.equal(readResolverCursor(`${cursor}x`, 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab', 'test-resolver-secret'), null);
});

test('photo-level subject uses exact submission or Mongo photo id only', () => {
  const filter = buildSubjectMatchFilter({ version: 1, caseId: 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab', subject: { kind: 'camera_photo', id: '507f1f77bcf86cd799439011' } });
  assert.deepEqual(filter?.$or, [{ submissionId: '507f1f77bcf86cd799439011' }, { _id: new ObjectId('507f1f77bcf86cd799439011') }]);
});
