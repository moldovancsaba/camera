import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { translate } from '@/lib/i18n';
import { runFollowUps, savePartnerFollowUp, type FollowUpDeps } from './follow-up';
import { followUpKey } from './follow-up-rules';
import type { SubmissionNotificationInput, SubmissionNotificationResult } from './submission-notification';

// Nothing in this file can send a real e-mail: the sender is a fake, and the provider's key is not in the environment either.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND;
delete process.env.EMAIL_API_KEY;

const NOW = new Date('2026-10-24T08:00:00.000Z');
const DAY = '2026-10-16';
const SENT: SubmissionNotificationResult = { sent: true, provider: 'resend', messageId: 'm1', recipientEmail: 'x@example.com' };
const FAILED: SubmissionNotificationResult = { sent: false, skipped: false, provider: 'resend', recipientEmail: 'x@example.com', error: 'Resend said no to ann@example.com' };

function sender(result: SubmissionNotificationResult | (() => SubmissionNotificationResult) = SENT) {
  const calls: SubmissionNotificationInput[] = [];
  return {
    calls,
    send: async (input: SubmissionNotificationInput) => {
      calls.push(input);
      return typeof result === 'function' ? result() : result;
    },
  };
}

const deps = (send: FollowUpDeps['send'], extra: Partial<FollowUpDeps> = {}): FollowUpDeps => ({ send, now: () => NOW, maxAgeDays: 21, ...extra });

const event = (key: string, partnerId: string, extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), eventId: key, partnerId, name: `Event ${key}`, uiLanguage: 'hu', eventDate: DAY, ...extra });
const on = { notifications: { types: { followUp: { enabled: true } } } };
const off = { notifications: { types: { followUp: { enabled: false } } } };

let counter = 0;
const photo = (eventKey: string, email: string | null, extra: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  eventId: eventKey,
  eventIds: [eventKey],
  userInfo: email ? { name: email.split('@')[0], email } : { name: 'No address' },
  consents: [{ pageId: 'accept', pageType: 'accept', accepted: true, acceptedAt: '2026-10-16T10:00:00.000Z' }],
  reviewStatus: 'approved',
  createdAt: `2026-10-16T10:${String(10 + counter++).padStart(2, '0')}:00.000Z`,
  ...extra,
});

/** One partner that switched the follow up on for its events, one that did not, and the events and photos of the scenarios below. */
function world() {
  const e1 = event('e1', 'P'); // follows its partner: on
  const e2 = event('e2', 'Q', on); // its own choice: on
  const e3 = event('e3', 'Q'); // follows its partner: off (the standard)
  const e4 = event('e4', 'P', off); // its own choice off wins over the partner's on
  const e5 = event('e5', 'P', { eventDate: '2026-10-20' }); // on, but only 4 days ago
  const e6 = event('e6', 'P', { eventDate: '2026-08-01' }); // on, but long past the window
  const e7 = event('e7', 'P', { eventDate: undefined }); // on, no date
  const photos = [
    photo('e1', 'ann@example.com', { shareToken: 'old-token' }),
    photo('e1', 'Ann@Example.com', { shareToken: 'new-token' }), // newest photo of the same person: gives the link, still one e-mail
    photo('e1', 'bob@example.com', { consents: [] }), // did not agree to the terms
    photo('e1', null), // no address
    photo('e1', 'anonymous@event.com'), // the placeholder address
    photo('e1', 'cy@example.com', { reviewStatus: 'pending_review' }), // not approved
    photo('e1', 'dee@example.com', { isArchived: true }),
    photo('e1', 'eve@example.com', { submissionKind: 'tryon_result' }),
    photo('e1', 'fay@example.com', { hiddenFromEvents: ['e1'] }),
    photo('e1', 'gus@example.com', { mediaHealth: { broken: true } }),
    photo('e2', 'hal@example.com'),
    photo('e3', 'ivy@example.com'),
    photo('e4', 'jon@example.com'),
    photo('e5', 'kim@example.com'),
    photo('e6', 'lou@example.com'),
    photo('e7', 'max@example.com'),
    photo('other', 'ann@example.com'),
  ];
  return fakeDb({
    events: [e1, e2, e3, e4, e5, e6, e7],
    partners: [
      { partnerId: 'P', name: 'MTK', followUpEmail: true },
      { partnerId: 'Q', name: 'Other' },
    ],
    submissions: photos,
    admin_settings: [],
    email_follow_ups: [],
  });
}

const recipients = (calls: SubmissionNotificationInput[]) => calls.map((call) => call.recipientEmail).sort();

test('a dry run only counts: it says who would get the e-mail and writes and sends nothing', async () => {
  const { db, data, calls: writes } = world();
  const { calls, send } = sender();
  const result = await runFollowUps(db, deps(send), { dryRun: true });
  assert.equal(calls.length, 0, 'nothing is sent');
  assert.deepEqual(writes.map((call) => call.collection).filter((name) => name === 'email_follow_ups'), [], 'no claim is written');
  assert.equal(data.email_follow_ups.length, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.today, '2026-10-24');
  assert.equal(result.eventsInWindow, 4, 'e1 to e4 have a date in the window; e5 is too early, e6 too old and e7 has no date');
  assert.equal(result.eventsOn, 2, 'e1 follows its partner, e2 chose it');
  assert.equal(result.eventsOnWithoutDate, 1, 'e7 has it on but no date');
  assert.equal(result.eligible, 2, 'ann (one e-mail for two photos) and hal');
  assert.equal(result.toSend, 2);
  assert.equal(result.withoutConsent, 1, 'bob');
  assert.equal(result.photosWithoutAddress, 2, 'the photo with no address and the placeholder address');
  assert.deepEqual(result.events.map((row) => [row.eventId, row.eligible, row.toSend]), [['e1', 1, 1], ['e2', 1, 1]]);
});

test('a real run sends one e-mail to each eligible user with the link to their newest approved photo, and nothing for the events that did not switch it on or are not due', async () => {
  const { db, data } = world();
  const { calls, send } = sender();
  const result = await runFollowUps(db, deps(send), { dryRun: false });
  assert.deepEqual(recipients(calls), ['ann@example.com', 'hal@example.com']);
  assert.equal(result.sent, 2);
  assert.equal(result.failed, 0);
  const ann = calls.find((call) => call.recipientEmail === 'ann@example.com')!;
  assert.match(ann.shareUrl, /\/share\/new-token$/, 'the newest photo gives the link, by its share token');
  assert.equal(ann.language, 'hu');
  assert.equal(ann.eventName, 'Event e1');
  assert.equal(ann.noButton, false);
  assert.equal(ann.buttonLabel, translate('hu', 'email.buttonSee'), 'the button leads to the photo');
  assert.equal(ann.subjectTemplate, translate('hu', 'email.followUpSubject'), 'the default text of the follow up in the language of the event');
  assert.ok(ann.bodyTemplate?.includes('{date}') && ann.bodyTemplate.includes('{link}'));
  assert.equal(ann.facts?.date, DAY);
  assert.equal(data.email_follow_ups.length, 2);
  for (const row of data.email_follow_ups) {
    assert.ok(row.sentAt && !('claimedAt' in row));
    assert.equal(JSON.stringify(row).includes('example.com'), false, 'the claim row holds no address');
  }
  assert.ok(data.email_follow_ups.some((row) => row._id === followUpKey('e1', 'ann@example.com')));
});

test('the user\'s own choice of the event wins over the partner, the partner\'s default over the standard, and the standard is off', async () => {
  const { db } = world();
  const { calls, send } = sender();
  await runFollowUps(db, deps(send), { dryRun: false });
  const events = new Set(calls.map((call) => call.eventName));
  assert.deepEqual([...events].sort(), ['Event e1', 'Event e2']);
  assert.equal(events.has('Event e3'), false, 'no choice anywhere: off');
  assert.equal(events.has('Event e4'), false, 'the event chose off though its partner is on');
});

test('safe to run twice: the second run sends nothing and says they were already sent', async () => {
  const { db } = world();
  const first = sender();
  await runFollowUps(db, deps(first.send), { dryRun: false });
  const second = sender();
  const result = await runFollowUps(db, deps(second.send), { dryRun: false });
  assert.equal(second.calls.length, 0);
  assert.equal(result.sent, 0);
  assert.equal(result.alreadySent, 2);
  assert.equal((await runFollowUps(db, deps(second.send), { dryRun: true })).toSend, 0);
});

test('two runs at the same moment send each e-mail once: only the run that wins the claim sends', async () => {
  const { db, data } = world();
  const a = sender();
  const b = sender();
  const [ra, rb] = await Promise.all([runFollowUps(db, deps(a.send), { dryRun: false }), runFollowUps(db, deps(b.send), { dryRun: false })]);
  assert.equal(a.calls.length + b.calls.length, 2, 'two e-mails in all, not four');
  assert.deepEqual(recipients([...a.calls, ...b.calls]), ['ann@example.com', 'hal@example.com']);
  assert.equal(ra.sent + rb.sent, 2);
  assert.equal(data.email_follow_ups.length, 2);
});

test('a user with several photos at the event, or at the same event on a second run, gets one e-mail', async () => {
  const { db } = world();
  const { calls, send } = sender();
  await runFollowUps(db, deps(send), { dryRun: false });
  await runFollowUps(db, deps(send), { dryRun: false });
  assert.equal(calls.filter((call) => call.recipientEmail === 'ann@example.com').length, 1);
});

test('a send that fails gives the claim back, counts an attempt and keeps only a short code; the next run tries again until the attempts are used up', async () => {
  const { db, data } = world();
  const { calls, send } = sender(FAILED);
  let result = await runFollowUps(db, deps(send), { dryRun: false });
  assert.equal(result.failed, 2);
  assert.equal(result.sent, 0);
  for (const row of data.email_follow_ups) {
    assert.equal(row.attempts, 1);
    assert.ok(!('claimedAt' in row) && !('sentAt' in row), 'the claim is given back');
    assert.equal(row.lastReason, 'send_failed');
    assert.equal(JSON.stringify(row).includes('Resend said'), false, 'the provider\'s words (they can hold an address) are not kept');
  }
  await runFollowUps(db, deps(send), { dryRun: false });
  await runFollowUps(db, deps(send), { dryRun: false });
  assert.equal(calls.length, 6, 'three attempts for each of the two users');
  result = await runFollowUps(db, deps(send), { dryRun: false });
  assert.equal(calls.length, 6, 'then it is left');
  assert.equal(result.gaveUp, 2);
  assert.equal(result.failed, 0);
});

test('a skipped send (no provider configured) keeps its reason code, and a sender that throws counts as failed and gives the claim back', async () => {
  const skipped = world();
  await runFollowUps(skipped.db, deps(sender({ sent: false, skipped: true, reason: 'missing_api_key' }).send), { dryRun: false });
  assert.equal(skipped.data.email_follow_ups[0].lastReason, 'missing_api_key');
  const thrown = world();
  const result = await runFollowUps(
    thrown.db,
    deps(async () => {
      throw new Error('boom ann@example.com');
    }),
    { dryRun: false }
  );
  assert.equal(result.failed, 2);
  assert.ok(thrown.data.email_follow_ups.every((row) => !('claimedAt' in row) && row.lastReason === 'send_failed'));
});

test('a claim that was never answered is never taken over (the e-mail may have gone): it is counted as held', async () => {
  const { db, data } = world();
  data.email_follow_ups.push({ _id: followUpKey('e1', 'ann@example.com'), eventId: 'e1', claimedAt: '2026-10-24T07:00:00.000Z', attempts: 0 });
  const { calls, send } = sender();
  const result = await runFollowUps(db, deps(send), { dryRun: false });
  assert.deepEqual(recipients(calls), ['hal@example.com']);
  assert.equal(result.held, 1);
  assert.equal(data.email_follow_ups.find((row) => row._id === followUpKey('e1', 'ann@example.com'))!.claimedAt, '2026-10-24T07:00:00.000Z', 'untouched');
});

test('a run stops at its limit and leaves the rest for the next one; a dry run says how many there are in all', async () => {
  const { db } = world();
  const first = sender();
  const result = await runFollowUps(db, deps(first.send, { maxSends: 1 }), { dryRun: false });
  assert.equal(first.calls.length, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.remaining, 1);
  const second = sender();
  const next = await runFollowUps(db, deps(second.send, { maxSends: 1 }), { dryRun: false });
  assert.equal(second.calls.length, 1, 'the next run sends the one that was left');
  assert.equal(next.alreadySent, 1);
  assert.deepEqual(recipients([...first.calls, ...second.calls]), ['ann@example.com', 'hal@example.com']);

  const count = world();
  assert.equal((await runFollowUps(count.db, deps(sender().send, { maxSends: 1 }), { dryRun: true })).toSend, 2);
});

test('a run stops starting e-mails when its time budget is used', async () => {
  const { db } = world();
  let time = 0;
  const { calls, send } = sender();
  const result = await runFollowUps(db, deps(send, { budgetMs: 50, clock: () => (time += 40) }), { dryRun: false });
  assert.equal(calls.length < 2, true);
  assert.equal(result.sent + result.remaining, 2);
});

test('the window is the one given: an event older than it gets nothing, a longer window reaches it', async () => {
  const w = world();
  const short = await runFollowUps(w.db, deps(sender().send, { maxAgeDays: 8 }), { dryRun: true });
  assert.equal(short.toSend, 2, 'age 8 is still inside a window of 8 days');
  const tooShort = await runFollowUps(w.db, { ...deps(sender().send), now: () => new Date('2026-10-26T08:00:00Z'), maxAgeDays: 8 }, { dryRun: true });
  assert.equal(tooShort.toSend, 0, 'age 10 is outside a window of 8 days');
  const longer = await runFollowUps(w.db, { ...deps(sender().send), now: () => new Date('2026-10-26T08:00:00Z'), maxAgeDays: 30 }, { dryRun: true });
  assert.equal(longer.toSend, 2);
});

test('an event that switched it off, or whose partner has it off, sends nothing whatever the photos say; with nothing switched on the run does nothing at all', async () => {
  const { db, data } = fakeDb({ events: [event('x1', 'Q'), event('x2', 'Q', off)], partners: [{ partnerId: 'Q', name: 'Q', followUpEmail: false }], submissions: [photo('x1', 'a@example.com'), photo('x2', 'b@example.com')], admin_settings: [], email_follow_ups: [] });
  const { calls, send } = sender();
  const result = await runFollowUps(db, deps(send), { dryRun: false });
  assert.equal(calls.length, 0);
  assert.equal(result.eventsOn, 0);
  assert.equal(data.email_follow_ups.length, 0);
});

test('the partner default is saved as true or false and taken away with null; an unknown partner is reported', async () => {
  const { db, data } = fakeDb({ partners: [{ partnerId: 'P', name: 'MTK' }] });
  assert.equal(await savePartnerFollowUp(db, 'P', true, 'now'), true);
  assert.equal(data.partners[0].followUpEmail, true);
  assert.equal(await savePartnerFollowUp(db, 'P', false, 'now'), true);
  assert.equal(data.partners[0].followUpEmail, false);
  assert.equal(await savePartnerFollowUp(db, 'P', null, 'now'), true);
  assert.equal('followUpEmail' in data.partners[0], false);
  assert.equal(await savePartnerFollowUp(db, 'nobody', true, 'now'), false);
});
