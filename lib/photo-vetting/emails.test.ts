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
  assert.match(takeAnotherPhotoUrl('e1', 'https://x.test/', { shortUrlSlug: 'mtk' }), /^https:\/\/[^/]+\/mtk$/, 'an event with a URL slug is linked by its short link');
  assert.equal(takeAnotherPhotoUrl('e1', 'https://x.test/', { shortUrlSlug: '' }), 'https://x.test/capture/e1', 'no slug: the capture page');
});

test('a wording written for the partner or the event reaches the sender: the not-approved texts, the button label and the sender\'s defaults use it', async () => {
  const { calls, send } = recorder();
  const texts = { 'email.notApprovedSubject': 'Try again, {name}', 'email.buttonAnother': 'One more' };
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby' } as never, 'https://x.test/capture/e1', send, null, texts);
  assert.equal(calls[0].subjectTemplate, 'Try again, {name}');
  assert.equal(calls[0].buttonLabel, 'One more');
  assert.deepEqual(calls[0].texts, texts, 'the sender gets the wordings for the words around the name and the event');
  const approved = recorder();
  await sendPhotoApprovedEmail(guest, { name: 'Derby' } as never, 'https://x.test/share/tok', approved.send, null, { 'email.buttonSee': 'Look' });
  assert.equal(approved.calls[0].buttonLabel, 'Look');
  const plain = recorder();
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby' } as never, 'https://x.test/capture/e1', plain.send);
  assert.equal(plain.calls[0].subjectTemplate, NOT_APPROVED_SUBJECT, 'no wording: exactly what it always was');
});

test('the approved e-mail of a vetted photo stops only when the editor chose off for the approved type; the old switches never stop it', async () => {
  const { calls, send } = recorder();
  const off = await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { types: { approved: { enabled: false } } } } as never, 'https://x.test/share/tok', send);
  assert.deepEqual([off.sent, 'skipped' in off && off.skipped], [false, true]);
  assert.equal(calls.length, 0);
  const oldOff = await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { submissionResultEmailEnabled: false, submissionResultEmailSendAfterSave: false } } as never, 'https://x.test/share/tok', send);
  assert.equal(oldOff.sent, true, 'the old switches never turned the link off for a vetted photo');
  const on = await sendPhotoApprovedEmail(guest, { name: 'Derby', notifications: { types: { approved: { enabled: true, subject: 'Own {event}', body: 'Own {link}' } } } } as never, 'https://x.test/share/tok', send);
  assert.equal(on.sent, true);
  assert.deepEqual([calls[1].subjectTemplate, calls[1].bodyTemplate], ['Own {event}', 'Own {link}']);
});

test('the declined e-mail is on by default, the event can write its own subject and message, and an editor can switch it off', async () => {
  const { calls, send } = recorder();
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby' } as never, 'https://x.test/capture/e1', send);
  assert.equal(calls[0].subjectTemplate, NOT_APPROVED_SUBJECT, 'on, with the standard wording, for an event that never chose');
  await sendPhotoNotApprovedEmail(guest, { name: 'Derby', notifications: { types: { declined: { subject: 'Sorry {name}', body: 'Try again: {link}' } } } } as never, 'https://x.test/capture/e1', send);
  assert.deepEqual([calls[1].subjectTemplate, calls[1].bodyTemplate], ['Sorry {name}', 'Try again: {link}']);
  const off = await sendPhotoNotApprovedEmail(guest, { name: 'Derby', notifications: { types: { declined: { enabled: false } } } } as never, 'https://x.test/capture/e1', send);
  assert.deepEqual([off.sent, 'skipped' in off && off.skipped], [false, true]);
  assert.equal(calls.length, 2, 'nothing was sent when it is off');
});
