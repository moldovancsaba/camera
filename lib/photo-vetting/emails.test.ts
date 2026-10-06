import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SubmissionNotificationInput } from '@/lib/email/submission-notification';
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

test('links: the share link carries the token, the retake link the event key', () => {
  assert.equal(approvedShareUrl('tok', 'https://x.test/'), 'https://x.test/share/tok');
  assert.equal(takeAnotherPhotoUrl('a b', 'https://x.test/'), 'https://x.test/capture/a%20b');
});
