import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { buildSubmissionEmailInput, dispatchPendingSubmissionEmailForSubmission, normalizeSubmissionEmailPolicy, resolveSubmissionResultEmailRecipient } from './submission-result-email';
import {
  DEFAULT_EVENT_TERMS_URL,
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
  emailDefaults,
} from './submission-template-defaults';

// The database is never touched: a photo that is not approved is turned away before any lookup.
const noDatabase = new Proxy({}, { get: () => { throw new Error('the database must not be used'); } }) as never;

test('the generic email dispatcher sends nothing for a pending or rejected photo', async () => {
  for (const reviewStatus of ['pending_review', 'rejected']) {
    const result = await dispatchPendingSubmissionEmailForSubmission(noDatabase, { _id: new ObjectId(), reviewStatus } as never);
    assert.equal(result, null);
  }
});

// What the event editor saves when its email fields are left as they are: the English defaults and the English terms link.
const savedByTheEditor = {
  submissionResultEmailEnabled: true,
  submissionResultEmailSubjectAfterSave: DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  submissionResultEmailBodyAfterSave: DEFAULT_SUBMISSION_EMAIL_BODY,
  submissionResultEmailSubjectAfterRelatedPhotosReady: DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  submissionResultEmailBodyAfterRelatedPhotosReady: DEFAULT_SUBMISSION_EMAIL_BODY,
  submissionResultEmailSubjectAfterTryOnResubmissionApproved: DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
  submissionResultEmailBodyAfterTryOnResubmissionApproved: DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  termsUrl: DEFAULT_EVENT_TERMS_URL,
};

test('without a language, or in English, the email settings are read exactly as before (the event API stores what it reads)', () => {
  for (const policy of [normalizeSubmissionEmailPolicy(savedByTheEditor), normalizeSubmissionEmailPolicy(savedByTheEditor, 'en')]) {
    assert.equal(policy.language, 'en');
    assert.equal(policy.subjectTemplateAfterSave, DEFAULT_SUBMISSION_EMAIL_SUBJECT);
    assert.equal(policy.bodyTemplateAfterSave, DEFAULT_SUBMISSION_EMAIL_BODY);
    assert.equal(policy.subjectTemplateAfterTryOnResubmissionApproved, DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT);
    assert.equal(policy.termsUrl, DEFAULT_EVENT_TERMS_URL);
  }
  assert.equal(normalizeSubmissionEmailPolicy({}).termsUrl, DEFAULT_EVENT_TERMS_URL);
  assert.equal(normalizeSubmissionEmailPolicy({ termsUrl: 'https://club.test/terms' }).termsUrl, 'https://club.test/terms');
  assert.equal(normalizeSubmissionEmailPolicy({}).subjectTemplateAfterSave, '');
});

test('in Hungarian the English defaults an editor saved are the Hungarian defaults of the same kind, and the terms link is the Hungarian page', () => {
  const hu = emailDefaults('hu');
  const policy = normalizeSubmissionEmailPolicy(savedByTheEditor, 'hu');
  assert.equal(policy.language, 'hu');
  assert.equal(policy.subjectTemplateAfterSave, hu.subject);
  assert.equal(policy.bodyTemplateAfterSave, hu.body);
  assert.equal(policy.subjectTemplateAfterRelatedPhotosReady, hu.subject);
  assert.equal(policy.subjectTemplateAfterTryOnResubmissionApproved, hu.resubmissionSubject);
  assert.equal(policy.bodyTemplateAfterTryOnResubmissionApproved, hu.resubmissionBody);
  assert.equal(policy.termsUrl, 'https://seyuselfies.com/hu/policies/');
  assert.equal(normalizeSubmissionEmailPolicy({}, 'hu').termsUrl, 'https://seyuselfies.com/hu/policies/');
});

test('in Hungarian an editor’s own email text and own terms link still win, even when they are English', () => {
  const policy = normalizeSubmissionEmailPolicy({ submissionResultEmailSubjectAfterSave: 'Your {event} photo!', submissionResultEmailBodyAfterSave: 'Szia {name}! {link}', termsUrl: 'https://club.test/terms' }, 'hu');
  assert.equal(policy.subjectTemplateAfterSave, 'Your {event} photo!');
  assert.equal(policy.bodyTemplateAfterSave, 'Szia {name}! {link}');
  assert.equal(policy.termsUrl, 'https://club.test/terms');
});

test('the email input carries the language of the policy to the sender', () => {
  const guest = { userInfo: { name: 'Ann', email: 'ann@example.com' } };
  assert.equal(buildSubmissionEmailInput(guest, 'https://x.test/share/a', normalizeSubmissionEmailPolicy({}, 'hu'), 'Derby')?.language, 'hu');
  assert.equal(buildSubmissionEmailInput(guest, 'https://x.test/share/a', normalizeSubmissionEmailPolicy({}), 'Derby')?.language, 'en');
});

test('a guest without a name is "there" to the sender, as before', () => {
  assert.equal(resolveSubmissionResultEmailRecipient({ userInfo: { email: 'ann@example.com' } }).name, 'there');
});
