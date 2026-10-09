import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import type { SubmissionNotificationInput, SubmissionNotificationResult } from './submission-notification';
import { dispatchArrivedEmail, registerVisitor } from './triggers';

const SENT: SubmissionNotificationResult = { sent: true, provider: 'resend', messageId: 'm1', recipientEmail: 'ann@example.com' };
const FAILED: SubmissionNotificationResult = { sent: false, skipped: false, provider: 'resend', recipientEmail: 'ann@example.com', error: 'boom' };

function recorder(result: SubmissionNotificationResult = SENT) {
  const calls: SubmissionNotificationInput[] = [];
  return { calls, send: async (input: SubmissionNotificationInput) => (calls.push(input), result) };
}

const event = (notifications: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  eventId: 'e-uuid',
  partnerId: 'P',
  name: 'MTK x Vasas',
  uiLanguage: 'hu',
  shortUrlSlug: 'mtk-vasas',
  ...(notifications ? { notifications } : {}),
  ...extra,
});
const world = (ev: Record<string, unknown>) => fakeDb({ events: [ev], partners: [{ partnerId: 'P', name: 'MTK' }], admin_settings: [], email_registrations: [] });

test('registering sends the welcome e-mail once for each event and address, when the event has it on', async () => {
  const { db, data } = world(event({ types: { welcome: { enabled: true } } }));
  const { calls, send } = recorder();
  assert.equal(await registerVisitor(db, data.events[0], { name: '  Anna  Kiss ', email: 'Anna@Example.com' }, send), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].recipientEmail, 'anna@example.com');
  assert.equal(calls[0].recipientName, 'Anna Kiss');
  assert.match(calls[0].shareUrl, /\/mtk-vasas$/, 'the link is the event’s short link');
  assert.equal(calls[0].noButton, false);
  assert.ok(calls[0].bodyTemplate?.includes('{eventlink}'), 'the default welcome text, in the event’s language');
  assert.equal(calls[0].language, 'hu');
  assert.equal(data.email_registrations.length, 1);
  assert.ok(data.email_registrations[0].welcomeSentAt && !('welcomeClaimedAt' in data.email_registrations[0]));
  await registerVisitor(db, data.events[0], { name: 'Anna', email: 'anna@example.com' }, send);
  await registerVisitor(db, data.events[0], { name: 'Anna', email: ' ANNA@example.com ' }, send);
  assert.equal(calls.length, 1, 'the same address at the same event is welcomed once');
  assert.equal(data.email_registrations.length, 1);
  await registerVisitor(db, data.events[0], { name: 'Bob', email: 'bob@example.com' }, send);
  assert.equal(calls.length, 2, 'another address is welcomed');
});

test('an event that never switched welcome on sends nothing, and the registration is still recorded without a claim', async () => {
  for (const notifications of [undefined, {}, { types: { welcome: { enabled: false } } }]) {
    const { db, data } = world(event(notifications));
    const { calls, send } = recorder();
    assert.equal(await registerVisitor(db, data.events[0], { name: 'Anna', email: 'anna@example.com' }, send), true);
    assert.equal(calls.length, 0, JSON.stringify(notifications));
    assert.equal(data.email_registrations.length, 1);
    assert.equal('welcomeClaimedAt' in data.email_registrations[0] || 'welcomeSentAt' in data.email_registrations[0], false);
  }
});

test('the event’s own welcome subject and message are used, and a failed send gives the claim back so a later call tries again', async () => {
  const { db, data } = world(event({ types: { welcome: { enabled: true, subject: 'Üdv {name}', body: 'Gyere: {eventlink}' } } }));
  const failing = recorder(FAILED);
  await registerVisitor(db, data.events[0], { name: 'Anna', email: 'anna@example.com' }, failing.send);
  assert.deepEqual([failing.calls[0].subjectTemplate, failing.calls[0].bodyTemplate], ['Üdv {name}', 'Gyere: {eventlink}']);
  assert.equal(data.email_registrations.length, 1);
  assert.equal('welcomeSentAt' in data.email_registrations[0] || 'welcomeClaimedAt' in data.email_registrations[0], false, 'nothing was sent, nothing is claimed');
  const ok = recorder();
  await registerVisitor(db, data.events[0], { name: 'Anna', email: 'anna@example.com' }, ok.send);
  assert.equal(ok.calls.length, 1, 'the next call sends it');
});

test('an address that is not an e-mail address is refused, and a claim held by another call is respected', async () => {
  const { db, data } = world(event({ types: { welcome: { enabled: true } } }));
  const { calls, send } = recorder();
  for (const bad of [undefined, null, '', 'nope', 'a@b', '@x.hu', 7]) assert.equal(await registerVisitor(db, data.events[0], { email: bad }, send), false, String(bad));
  assert.equal(data.email_registrations.length, 0);
  data.email_registrations.push({ eventId: 'e-uuid', email: 'held@example.com', welcomeClaimedAt: 'now' });
  assert.equal(await registerVisitor(db, data.events[0], { email: 'held@example.com' }, send), true);
  assert.equal(calls.length, 0, 'another call holds the claim and is sending');
});

const submission = (extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), eventId: 'e-uuid', submissionKind: 'original', userInfo: { name: 'Anna', email: 'anna@example.com' }, metadata: {}, ...extra });

test('the arrived e-mail goes once to the address of a submitted photo, with no button, when the event has it on', async () => {
  const { db } = world(event({ types: { arrived: { enabled: true } } }));
  const { calls, send } = recorder();
  const photo = submission();
  const result = await dispatchArrivedEmail(db, photo, send);
  assert.equal(result?.sent, true);
  assert.ok(typeof result?.metadataPatch['metadata.arrivedEmailSentAt'] === 'string');
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].noButton, calls[0].buttonLabel], [true, null]);
  assert.match(calls[0].shareUrl, /\/mtk-vasas$/);
  assert.equal(await dispatchArrivedEmail(db, { ...photo, metadata: { arrivedEmailSentAt: 'earlier' } }, send), null, 'once for each photo');
  assert.equal(calls.length, 1);
});

test('the arrived e-mail does nothing when it is off, has no address yet, or the photo is not an original; a failed send leaves no mark', async () => {
  const on = world(event({ types: { arrived: { enabled: true } } }));
  const off = world(event(undefined));
  const { calls, send } = recorder();
  assert.equal(await dispatchArrivedEmail(off.db, submission(), send), null, 'off by default');
  assert.equal(await dispatchArrivedEmail(on.db, submission({ userInfo: undefined, userEmail: 'anonymous@event' }), send), null, 'no address yet');
  assert.equal(await dispatchArrivedEmail(on.db, submission({ submissionKind: 'tryon_result' }), send), null);
  assert.equal(await dispatchArrivedEmail(on.db, submission({ eventId: 'unknown' }), send), null);
  assert.equal(calls.length, 0);
  const failing = recorder(FAILED);
  const failed = await dispatchArrivedEmail(on.db, submission(), failing.send);
  assert.deepEqual([failed?.sent, failed?.metadataPatch], [false, {}]);
});
