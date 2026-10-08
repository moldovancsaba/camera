import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SubmissionNotificationInput } from '@/lib/email/submission-notification';
import { emailDefaults } from '@/lib/email/submission-template-defaults';
import { approvedShareUrl, NOT_APPROVED_BODY, NOT_APPROVED_SUBJECT, sendPhotoApprovedEmail, sendPhotoNotApprovedEmail, takeAnotherPhotoUrl } from './emails';

const SENT = { sent: true, provider: 'resend', messageId: 'm1', recipientEmail: 'ann@example.com' } as const;
const guest = { userInfo: { name: 'Ann', email: 'ann@example.com' }, userEmail: 'anonymous@event', userName: 'Guest' };

function recorder() {
  const calls: SubmissionNotificationInput[] = [];
  return { calls, send: async (input: SubmissionNotificationInput) => (calls.push(input), SENT) };
}

test('the approval email goes to the guest with the link and the standard wording, even when the event has its email switch off', async () => {
  const { calls, send } = recorder();
  const result = await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailEnabled: false } } as never, 'https://x.test/share/tok', send);
  assert.equal(result.sent, true);
  assert.equal(calls[0].recipientEmail, 'ann@example.com');
  assert.equal(calls[0].shareUrl, 'https://x.test/share/tok');
  assert.equal(calls[0].eventName, 'Derby');
  assert.equal(calls[0].subjectTemplate || null, null, 'no event wording: the sender falls back to the standard text');
});

test('the approval email uses the wording the event wrote for the first email', async () => {
  const { calls, send } = recorder();
  await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailEnabled: true, submissionResultEmailSubjectAfterSave: 'Your {event} photo!', submissionResultEmailBodyAfterSave: 'Hi {name} {link}' } } as never, 'https://x.test/share/tok', send);
  assert.equal(calls[0].subjectTemplate, 'Your {event} photo!');
  assert.equal(calls[0].bodyTemplate, 'Hi {name} {link}');
});

test('the not-approved email has fixed wording and links to taking another photo', async () => {
  const { calls, send } = recorder();
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailSubjectAfterSave: 'custom' } } as never, 'https://x.test/capture/e1', send);
  assert.equal(calls[0].subjectTemplate, NOT_APPROVED_SUBJECT);
  assert.equal(calls[0].bodyTemplate, NOT_APPROVED_BODY);
  assert.equal(calls[0].shareUrl, 'https://x.test/capture/e1');
  assert.ok(NOT_APPROVED_BODY.includes('{link}') && NOT_APPROVED_BODY.includes('{name}'));
});

test('a guest without an address gets nothing sent to a made-up recipient', async () => {
  const { calls, send } = recorder();
  await sendPhotoApprovedEmail({ userInfo: undefined, userEmail: 'anonymous@event', userName: 'Guest' }, null, 'https://x.test/share/tok', send);
  assert.ok(!calls[0].recipientEmail, 'the sender skips an empty recipient (missing_recipient)');
});

test('in English the not-approved email and the button labels keep their words exactly', async () => {
  assert.equal(NOT_APPROVED_SUBJECT, 'About your photo from {event}');
  assert.equal(
    NOT_APPROVED_BODY,
    'Hi {name},\n\nThank you for taking part in {event}. Unfortunately your photo could not be approved, so it will not be published.\n\nYou are welcome to take another photo:\n{link}\n\nPolicies and General Terms and Conditions:\n{terms}'
  );
  const { calls, send } = recorder();
  await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: {} } as never, 'https://x.test/share/tok', send);
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby', notifications: {}, uiLanguage: 'en' } as never, 'https://x.test/capture/e1', send);
  assert.deepEqual(calls.map((call) => [call.buttonLabel, call.language, call.termsUrl]), [
    ['See your photo', 'en', 'https://seyuselfies.com/en/policies/'],
    ['Take another photo', 'en', 'https://seyuselfies.com/en/policies/'],
  ]);
});

test('in Hungarian the approval email has the Hungarian button, the Hungarian legal page and the language for the sender’s defaults', async () => {
  const { calls, send } = recorder();
  await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { termsUrl: 'https://seyuselfies.com/en/policies/' }, uiLanguage: 'hu' } as never, 'https://x.test/share/tok', send);
  assert.equal(calls[0].language, 'hu');
  assert.equal(calls[0].buttonLabel, 'Nézd meg a fotódat');
  assert.equal(calls[0].termsUrl, 'https://seyuselfies.com/hu/policies/', 'the English link the editor saved counts as not set');
  assert.equal(calls[0].subjectTemplate || null, null, 'no event wording: the sender falls back to the Hungarian default');
});

test('in Hungarian the English after-save wording the editor saved becomes the Hungarian default; an own wording is sent as written', async () => {
  const { calls, send } = recorder();
  const saved = { submissionResultEmailSubjectAfterSave: emailDefaults('en').subject, submissionResultEmailBodyAfterSave: emailDefaults('en').body };
  await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: saved, uiLanguage: 'hu' } as never, 'https://x.test/share/tok', send);
  await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailSubjectAfterSave: 'Itt a fotód, {name}!' }, uiLanguage: 'hu' } as never, 'https://x.test/share/tok', send);
  assert.equal(calls[0].subjectTemplate, 'A fotód – {event}');
  assert.equal(calls[0].bodyTemplate, emailDefaults('hu').body);
  assert.equal(calls[1].subjectTemplate, 'Itt a fotód, {name}!');
});

test('in Hungarian the not-approved email is Hungarian and keeps its fixed wording whatever the event wrote', async () => {
  const { calls, send } = recorder();
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailSubjectAfterSave: 'custom' }, uiLanguage: 'hu' } as never, 'https://x.test/capture/e1', send);
  assert.equal(calls[0].subjectTemplate, 'A fotódról – {event}');
  assert.equal(calls[0].bodyTemplate, emailDefaults('hu').notApprovedBody);
  assert.match(calls[0].bodyTemplate ?? '', /^Szia \{name\}!\n\n.*nem tudtuk jóváhagyni/);
  assert.equal(calls[0].buttonLabel, 'Új fotó készítése');
  assert.equal(calls[0].language, 'hu');
  assert.equal(calls[0].shareUrl, 'https://x.test/capture/e1');
});

test('links: the share link carries the token, the retake link the event key', () => {
  assert.equal(approvedShareUrl('tok', 'https://x.test/'), 'https://x.test/share/tok');
  assert.equal(takeAnotherPhotoUrl('a b', 'https://x.test/'), 'https://x.test/capture/a%20b');
});
