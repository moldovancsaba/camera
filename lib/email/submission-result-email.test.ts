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

test('an event with no language of its own is read with its partner\'s, so its e-mails go out in that language; an event with its own keeps it; the wordings of the levels are read for the e-mails', async () => {
  const { fakeDb } = await import('@/lib/library/fake-db');
  const { resolveEventForSubmission, textsOf } = await import('./submission-result-email');
  const { db } = fakeDb({
    partners: [{ partnerId: 'P', name: 'MTK', uiLanguage: 'hu', texts: { hu: { 'email.buttonSee': 'Nézd meg' } } }],
    events: [
      { eventId: 'follows', partnerId: 'P', name: 'Follows' },
      { eventId: 'own', partnerId: 'P', name: 'Own', uiLanguage: 'en' },
    ],
    admin_settings: [],
  });
  const follows = await resolveEventForSubmission(db, { eventId: 'follows' } as never);
  assert.equal(follows?.uiLanguage, 'hu');
  assert.equal((await resolveEventForSubmission(db, { eventId: 'own' } as never))?.uiLanguage, 'en');
  assert.deepEqual(await textsOf(db, follows), { 'email.buttonSee': 'Nézd meg' });
  assert.equal(await textsOf(db, null), null);
});

test('the five types: approved and declined are on for an event that never chose (owner, answer 204); welcome, arrived and follow up are off', () => {
  for (const never of [undefined, null, {}, { submissionResultEmailSubject: 'Old subject' }]) {
    const policy = normalizeSubmissionEmailPolicy(never);
    assert.deepEqual(
      ['welcome', 'arrived', 'approved', 'declined', 'followUp'].map((type) => policy.types[type as keyof typeof policy.types].enabled),
      [false, false, true, true, false],
      JSON.stringify(never)
    );
    assert.equal(policy.sendAfterSave, true, 'the approved e-mail is the after-save e-mail');
    assert.equal(policy.enabled, true);
    assert.equal(policy.types.approved.chosen, null, 'nothing was chosen: it follows the default');
  }
});

test('a choice stored by an editor wins: the old switches keep their meaning, and the new switches override them', () => {
  const off = normalizeSubmissionEmailPolicy({ submissionResultEmailEnabled: false });
  assert.deepEqual([off.enabled, off.sendAfterSave, off.types.approved.enabled], [false, false, false], 'the old master switch stored as off still turns approved off');
  assert.equal(off.types.approved.chosen, null, 'but it is not a choice of the new switch, so a vetted event still sends the link');
  const afterSaveOff = normalizeSubmissionEmailPolicy({ submissionResultEmailEnabled: true, submissionResultEmailSendAfterSave: false, submissionResultEmailSendAfterRelatedPhotosReady: true });
  assert.deepEqual([afterSaveOff.sendAfterSave, afterSaveOff.sendAfterRelatedPhotosReady, afterSaveOff.enabled], [false, true, true]);
  const newOn = normalizeSubmissionEmailPolicy({ submissionResultEmailEnabled: false, types: { approved: { enabled: true }, welcome: { enabled: true }, declined: { enabled: false } } });
  assert.deepEqual([newOn.sendAfterSave, newOn.types.welcome.enabled, newOn.types.declined.enabled], [true, true, false], 'the new switches win over the old ones');
  assert.deepEqual([newOn.types.approved.chosen, newOn.types.declined.chosen, newOn.types.arrived.chosen], [true, false, null]);
});

test('the event’s own subject and message of a type are read; the approved ones are the after-save pair', () => {
  const policy = normalizeSubmissionEmailPolicy({
    submissionResultEmailSubjectAfterSave: 'Legacy subject',
    types: { approved: { subject: 'Approved {event}', body: 'Hi {name} {link}' }, welcome: { subject: 'Welcome!', body: 'Come to {eventlink}' } },
  });
  assert.equal(policy.subjectTemplateAfterSave, 'Approved {event}', 'the approved type wins over the old after-save pair');
  assert.equal(policy.bodyTemplateAfterSave, 'Hi {name} {link}');
  assert.deepEqual([policy.types.welcome.subject, policy.types.welcome.body], ['Welcome!', 'Come to {eventlink}']);
  assert.deepEqual([policy.types.declined.subject, policy.types.declined.body], [null, null], 'no own text: the standard one');
});
