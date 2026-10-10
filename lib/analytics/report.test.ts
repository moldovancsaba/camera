import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhotoFacts } from './facts';
import { buildEventReport, buildEventsTable, NOT_MEASURED } from './report';

const BUDAPEST = { timeZone: 'Europe/Budapest', now: new Date('2026-10-16T21:00:00.000Z') };
let counter = 0;

/** A photo of a vetted event, waiting, taken by a user who gave an e-mail; every test changes what it is about. */
function fact(extra: Partial<PhotoFacts> = {}): PhotoFacts {
  counter += 1;
  return {
    id: `p${counter}`,
    eventKey: 'ev-1',
    eventKeys: ['ev-1'],
    createdAt: '2026-10-16T18:00:00.000Z',
    source: 'user',
    excluded: null,
    method: 'camera',
    device: 'ios',
    review: 'waiting',
    submittedAt: extra.createdAt ?? '2026-10-16T18:00:00.000Z',
    decisions: [],
    identity: 'email',
    userKey: `user${counter}@example.test`,
    email: `user${counter}@example.test`,
    consents: [],
    wallOptIn: false,
    galleryConsentAt: null,
    frame: { kind: 'none', label: 'No frame' },
    message: null,
    layout: null,
    mirrored: null,
    framing: null,
    plays: 0,
    lastPlayedAt: null,
    playsBySlideshow: {},
    people: undefined,
    peopleBy: null,
    peopleAt: null,
    emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
    ...extra,
  };
}

const decision = (action: 'approve' | 'reject', by: string, at: string, reason: string | null = null) => ({ action, by, at, reason });

test('photos taken, and the states they are in; photos an editor added are counted apart, removed and gone ones are named and left out', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ review: 'approved', decisions: [decision('approve', 'ann', '2026-10-16T18:02:00.000Z')] }),
        fact({ review: 'approved', decisions: [decision('approve', 'ann', '2026-10-16T18:03:00.000Z')] }),
        fact({ review: 'rejected', decisions: [decision('reject', 'bob', '2026-10-16T18:04:00.000Z', 'Not me')] }),
        fact({ review: 'waiting' }),
        fact({ review: 'none' }),
        fact({ source: 'editor', review: 'none', userKey: null, email: null, identity: 'none' }),
        fact({ excluded: 'archived' }),
        fact({ excluded: 'broken' }),
      ],
    },
    BUDAPEST,
  );
  assert.equal(report.photos.taken, 5);
  assert.equal(report.photos.approved, 2);
  assert.equal(report.photos.rejected, 1);
  assert.equal(report.photos.waiting, 1);
  assert.equal(report.photos.notVetted, 1);
  assert.equal(report.photos.approved + report.photos.rejected + report.photos.waiting + report.photos.notVetted, report.photos.taken, 'the states add up to the photos taken');
  assert.equal(report.photos.approvalRate, 2 / 3);
  assert.deepEqual([report.scope.counted, report.scope.addedByEditors, report.scope.removed, report.scope.brokenPictures], [6, 1, 1, 1]);
});

test('an empty event gives zeros and nulls, never a crash or a made-up rate', () => {
  const report = buildEventReport({ photos: [] }, BUDAPEST);
  assert.equal(report.photos.taken, 0);
  assert.equal(report.photos.approvalRate, null);
  assert.equal(report.photos.oldestWaitingSeconds, null);
  assert.equal(report.vetting.timeToFirstDecision.avgSeconds, null);
  assert.deepEqual(report.activity.days, []);
  assert.equal(report.activity.hours.length, 24);
  assert.equal(report.activity.busiestDay, null);
  assert.equal(report.users.photosPerUser, null);
  assert.equal(report.screens.avgPlaysPerShownPhoto, null);
});

test('the time from the photo being handed in to the first decision: average, median, the longest, in buckets; a decision made again does not count twice', () => {
  const at = (minutes: number) => new Date(Date.parse('2026-10-16T18:00:00.000Z') + minutes * 60_000).toISOString();
  const report = buildEventReport(
    {
      photos: [
        fact({ review: 'approved', decisions: [decision('approve', 'ann', at(0.5))] }), // 30 s
        fact({ review: 'approved', decisions: [decision('approve', 'ann', at(2))] }), // 2 min
        fact({ review: 'approved', decisions: [decision('reject', 'bob', at(10)), decision('approve', 'bob', at(11))] }), // first decision at 10 min, decided again
        fact({ review: 'rejected', decisions: [decision('reject', 'bob', at(600))] }), // 10 h
      ],
    },
    BUDAPEST,
  );
  const stats = report.vetting.timeToFirstDecision;
  assert.equal(stats.count, 4);
  assert.equal(stats.avgSeconds, (30 + 120 + 600 + 36000) / 4);
  assert.equal(stats.medianSeconds, (120 + 600) / 2);
  assert.equal(stats.maxSeconds, 36000);
  assert.deepEqual(report.vetting.timeBuckets.map((b) => [b.id, b.count]), [['under-1m', 1], ['1-5m', 1], ['5-15m', 1], ['15-60m', 0], ['1-6h', 0], ['over-6h', 1]]);
  assert.equal(report.vetting.decidedPhotos, 4);
  assert.equal(report.vetting.decisions, 5);
  assert.equal(report.vetting.decidedAgain, 1);
});

test('who decided: decisions and the time of the photos each one decided first, busiest first', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ review: 'approved', decisions: [decision('approve', 'ann', '2026-10-16T18:01:00.000Z')] }),
        fact({ review: 'approved', decisions: [decision('approve', 'ann', '2026-10-16T18:03:00.000Z')] }),
        fact({ review: 'rejected', decisions: [decision('reject', 'bob', '2026-10-16T18:10:00.000Z', 'Not me')] }),
      ],
    },
    BUDAPEST,
  );
  assert.deepEqual(report.vetting.reviewers.map((r) => [r.by, r.approvals, r.rejections, r.firstDecisions, r.avgSeconds, r.medianSeconds]), [['ann', 2, 0, 2, 120, 120], ['bob', 0, 1, 1, 600, 600]]);
});

test('a photo approved with no record of who decided it (set by the rollout) is counted as approved and named; it has no time', () => {
  const report = buildEventReport({ photos: [fact({ review: 'approved' })] }, BUDAPEST);
  assert.equal(report.photos.approved, 1);
  assert.equal(report.vetting.approvedWithoutRecord, 1);
  assert.equal(report.vetting.timeToFirstDecision.count, 0);
});

test('the reasons written for rejections: counted without regard to case or spacing, the most common first; the ones without a reason are counted too', () => {
  const rejected = (reason: string | null) => fact({ review: 'rejected', decisions: [decision('reject', 'bob', '2026-10-16T18:05:00.000Z', reason)] });
  const report = buildEventReport({ photos: [rejected('Not me'), rejected('not  me'), rejected('Blurry'), rejected(null), rejected('Not me')] }, BUDAPEST);
  assert.deepEqual(report.vetting.reasons.top.map((r) => [r.label, r.count]), [['Not me', 3], ['Blurry', 1]]);
  assert.equal(report.vetting.reasons.rejectionsWithReason, 4);
  assert.equal(report.vetting.reasons.rejectionsWithoutReason, 1);
});

test('the oldest waiting photo is as old as the time since it was handed in', () => {
  const report = buildEventReport({ photos: [fact({ createdAt: '2026-10-16T19:30:00.000Z' }), fact({ createdAt: '2026-10-16T20:45:00.000Z' })] }, BUDAPEST);
  assert.equal(report.photos.oldestWaitingSeconds, 90 * 60);
});

test('photos and users per day and hour on the clock of the time zone; quiet days show as zero; new users are counted on their first day', () => {
  const photos = [
    fact({ createdAt: '2026-10-16T18:10:00.000Z', userKey: 'a', consents: [{ label: 'I accept', pageType: 'accept', at: null }] }), // 20:10 Budapest on the 16th
    fact({ createdAt: '2026-10-16T18:40:00.000Z', userKey: 'b' }),
    fact({ createdAt: '2026-10-16T22:30:00.000Z', userKey: 'a' }), // 00:30 on the 17th in Budapest
    fact({ createdAt: '2026-10-18T09:00:00.000Z', userKey: 'c' }),
  ];
  const report = buildEventReport({ photos }, BUDAPEST);
  assert.deepEqual(report.activity.days.map((d) => [d.day, d.photos, d.users, d.newUsers, d.consented]), [['2026-10-16', 2, 2, 2, 1], ['2026-10-17', 1, 1, 0, 0], ['2026-10-18', 1, 1, 1, 0]]);
  assert.equal(report.activity.hours[20].photos, 2);
  assert.equal(report.activity.hours[20].users, 2);
  assert.equal(report.activity.hours[0].photos, 1);
  assert.equal(report.activity.hours[11].photos, 1);
  assert.deepEqual(report.activity.busiestDay, { day: '2026-10-16', photos: 2 });
  assert.deepEqual(report.activity.busiestHour, { hour: 20, photos: 2 });
  const utc = buildEventReport({ photos }, { timeZone: 'UTC' });
  assert.deepEqual(utc.activity.days.map((d) => [d.day, d.photos]), [['2026-10-16', 3], ['2026-10-17', 0], ['2026-10-18', 1]]);
});

test('a range of days keeps the photos taken on those days, the end day included', () => {
  const photos = [fact({ createdAt: '2026-10-15T20:00:00.000Z' }), fact({ createdAt: '2026-10-16T20:00:00.000Z' }), fact({ createdAt: '2026-10-17T20:00:00.000Z' }), fact({ createdAt: '2026-10-18T20:00:00.000Z' })];
  const report = buildEventReport({ photos }, { ...BUDAPEST, from: '2026-10-16', to: '2026-10-17' });
  assert.equal(report.photos.taken, 2);
  assert.deepEqual(report.options, { timeZone: 'Europe/Budapest', from: '2026-10-16', to: '2026-10-17' });
});

test('users: told apart by e-mail or account; signed in, typed e-mail, and the photos nobody can be traced from; returning users; the registered who took a photo', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ userKey: 'a@x.test', email: 'a@x.test', identity: 'signed_in' }),
        fact({ userKey: 'a@x.test', email: 'a@x.test', identity: 'signed_in' }),
        fact({ userKey: 'b@x.test', email: 'b@x.test', identity: 'email' }),
        fact({ userKey: null, email: null, identity: 'none' }),
      ],
      registrations: [
        { email: 'A@x.test', createdAt: '2026-10-16T17:00:00.000Z', welcomeSent: true },
        { email: 'c@x.test', createdAt: '2026-10-16T17:05:00.000Z', welcomeSent: false },
        { email: 'a@x.test', createdAt: '2026-10-16T17:06:00.000Z', welcomeSent: false },
      ],
    },
    BUDAPEST,
  );
  assert.deepEqual([report.users.distinct, report.users.signedIn, report.users.typedEmail, report.users.photosWithoutIdentity, report.users.returning, report.users.photosPerUser], [2, 1, 1, 1, 1, 1.5]);
  assert.deepEqual([report.users.registered, report.users.registeredWithPhoto], [2, 1]);
  assert.deepEqual([report.emails.welcome.registrations, report.emails.welcome.sent], [3, 1]);
});

test('the people marked at vetting are counted with summarizePeople, and who marked them', () => {
  const person = { id: 'a', box: { x: 10, y: 10, w: 30, h: 30 }, gender: 'female', age: 'adult', emotion: 'happy', merch: ['cap'] };
  const report = buildEventReport(
    {
      photos: [
        fact({ people: [person, { ...person, id: 'b', gender: 'male', age: 'old' }], peopleBy: 'ann' }),
        fact({ people: [], peopleBy: 'ann' }),
        fact({ people: [person], peopleBy: 'bob' }),
        fact({ people: undefined }),
      ],
    },
    BUDAPEST,
  );
  assert.equal(report.people.summary.photos, 3);
  assert.equal(report.people.summary.people, 3);
  assert.equal(report.people.summary.photosWithPeople, 2);
  assert.equal(report.people.summary.byEmotion.happy, 3);
  assert.equal(report.people.summary.withMerch, 3);
  assert.deepEqual(report.people.markers.map((m) => [m.label, m.count]), [['ann', 2], ['bob', 1]]);
});

test('devices, how the photo was provided, and the framing; an unknown value is its own row so the rows add up', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ device: 'ios', method: 'camera', framing: 'fill', mirrored: true }),
        fact({ device: 'ios', method: 'camera', framing: 'custom', mirrored: false }),
        fact({ device: 'android', method: 'upload', framing: null, mirrored: null }),
        fact({ device: 'unknown', method: 'unknown' }),
      ],
    },
    BUDAPEST,
  );
  assert.deepEqual(report.devices.map((d) => [d.id, d.count]), [['ios', 2], ['android', 1], ['desktop', 0], ['unknown', 1]]);
  assert.deepEqual(report.methods.map((d) => [d.id, d.count]), [['camera', 2], ['upload', 1], ['unknown', 1]]);
  assert.deepEqual(report.framing.modes.map((d) => [d.id, d.count]), [['fill', 1], ['fit', 0], ['custom', 1], ['unknown', 2]]);
  assert.deepEqual([report.framing.mirrored, report.framing.mirroredKnown], [1, 2]);
});

test('frames, messages and layouts chosen, the most chosen first', () => {
  const own = (name: string) => fact({ frame: { kind: 'own', label: name } });
  const generated = (message: string, layout: string) => fact({ frame: { kind: 'generated', label: 'Generated default frame' }, message, layout });
  const report = buildEventReport({ photos: [own('Away kit'), own('Away kit'), own('Home kit'), generated('Hajrá Vasas!', 'aaaa1111bbbb'), generated('hajrá vasas!', 'aaaa1111bbbb'), generated('Mindenki egyért', 'cccc2222dddd'), fact()] }, BUDAPEST);
  assert.deepEqual(report.choices.frames.map((r) => [r.label, r.count]), [['Away kit', 2], ['Generated default frame', 3], ['Home kit', 1], ['No frame', 1]].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))));
  assert.deepEqual(report.choices.messages.map((r) => [r.label, r.count]), [['Hajrá Vasas!', 2], ['Mindenki egyért', 1]]);
  assert.deepEqual(report.choices.layouts.map((r) => [r.label, r.count]), [['Layout aaaa1111', 2], ['Layout cccc2222', 1]]);
  assert.equal(report.choices.withMessage, 3);
});

test('plays on the screens: the total, how many photos were shown, how many of the photos that may be shown, the most played, and the plays by slideshow with its name', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ review: 'approved', plays: 10, lastPlayedAt: '2026-10-16T20:00:00.000Z', playsBySlideshow: { s1: { count: 8, lastPlayedAt: '2026-10-16T20:00:00.000Z' }, s2: { count: 2, lastPlayedAt: '2026-10-16T19:00:00.000Z' } } }),
        fact({ review: 'approved', plays: 2, lastPlayedAt: '2026-10-16T19:30:00.000Z', playsBySlideshow: { s1: { count: 2, lastPlayedAt: '2026-10-16T19:30:00.000Z' } } }),
        fact({ review: 'approved' }),
        fact({ review: 'waiting' }),
        fact({ source: 'editor', review: 'none', plays: 3, playsBySlideshow: { s1: { count: 3, lastPlayedAt: null } }, userKey: null, email: null, identity: 'none' }),
      ],
      slideshows: [{ id: 's1', name: 'Main screen' }],
    },
    BUDAPEST,
  );
  assert.equal(report.screens.plays, 15);
  assert.equal(report.screens.photosShown, 3);
  assert.equal(report.screens.eligible, 4);
  assert.equal(report.screens.eligibleShown, 3);
  assert.equal(report.screens.mostPlays, 10);
  assert.equal(report.screens.avgPlaysPerShownPhoto, 5);
  assert.equal(report.screens.lastPlayedAt, '2026-10-16T20:00:00.000Z');
  assert.deepEqual(report.screens.bySlideshow.map((s) => [s.name, s.plays, s.photos]), [['Main screen', 13, 3], ['Slideshow s2', 2, 1]]);
});

test('e-mails: the photo link sent, failed and skipped (with why), by kind; the arrived mail; the declined mail sent or not', () => {
  const report = buildEventReport(
    {
      photos: [
        fact({ emails: { arrived: true, photoLink: 'sent', photoLinkSkipReason: null, photoLinkKind: 'afterSave', declined: null } }),
        fact({ emails: { arrived: false, photoLink: 'sent', photoLinkSkipReason: null, photoLinkKind: 'relatedPhotos', declined: null } }),
        fact({ emails: { arrived: false, photoLink: 'failed', photoLinkSkipReason: null, photoLinkKind: null, declined: null } }),
        fact({ emails: { arrived: false, photoLink: 'skipped', photoLinkSkipReason: 'missing_recipient', photoLinkKind: null, declined: null } }),
        fact({ emails: { arrived: false, photoLink: 'skipped', photoLinkSkipReason: 'missing_recipient', photoLinkKind: null, declined: null } }),
        fact({ emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: 'sent' } }),
        fact({ emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: 'not_sent' } }),
      ],
    },
    BUDAPEST,
  );
  assert.deepEqual([report.emails.photoLink.sent, report.emails.photoLink.failed, report.emails.photoLink.skipped], [2, 1, 2]);
  assert.deepEqual(report.emails.photoLink.skippedBy.map((r) => [r.label, r.count]), [['missing_recipient', 2]]);
  assert.deepEqual(report.emails.photoLink.byKind, { afterSave: 1, relatedPhotos: 1, tryOnRerun: 0 });
  assert.equal(report.emails.arrived.sent, 1);
  assert.deepEqual(report.emails.declined, { sent: 1, notSent: 1 });
});

test('consents: photos with and without a consent record, the records by what the user read, the public gallery permission and the wall choice', () => {
  const consent = (label: string, at: string, pageType: 'accept' | 'cta' = 'accept') => ({ label, pageType, at });
  const report = buildEventReport(
    {
      photos: [
        fact({ consents: [consent('I accept the terms', '2026-10-16T17:00:00.000Z'), consent('Send me news', '2026-10-16T17:00:01.000Z', 'cta')], galleryConsentAt: '2026-10-16T18:00:00.000Z', wallOptIn: true }),
        fact({ consents: [consent('I accept the terms', '2026-10-16T19:00:00.000Z')] }),
        fact(),
      ],
    },
    BUDAPEST,
  );
  assert.deepEqual([report.consents.photosWithConsent, report.consents.photosWithoutConsent, report.consents.records], [2, 1, 3]);
  assert.deepEqual(report.consents.byLabel.map((r) => [r.label, r.count, r.firstAt, r.lastAt]), [['I accept the terms', 2, '2026-10-16T17:00:00.000Z', '2026-10-16T19:00:00.000Z'], ['Send me news', 1, '2026-10-16T17:00:01.000Z', '2026-10-16T17:00:01.000Z']]);
  assert.deepEqual([report.consents.galleryConsent, report.consents.wallOptIn], [1, 1]);
});

test('the table of events: one row per event, the busiest first, with the same counts as the report of each', () => {
  const photos = [
    fact({ eventKey: 'ev-1', review: 'approved', decisions: [decision('approve', 'ann', '2026-10-16T18:02:00.000Z')] }),
    fact({ eventKey: 'ev-1' }),
    fact({ eventKey: 'ev-2', plays: 4 }),
    fact({ eventKey: 'ev-2', plays: 4 }),
    fact({ eventKey: 'ev-2' }),
    fact({ eventKey: 'ev-3', excluded: 'archived' }),
  ];
  const rows = buildEventsTable(photos, [{ key: 'ev-1', id: 'm1', name: 'Vasas' }, { key: 'ev-2', name: 'Ferencváros' }], BUDAPEST);
  assert.deepEqual(rows.map((r) => [r.id, r.name, r.taken, r.approved, r.waiting, r.plays, r.users, r.avgDecisionSeconds]), [[null, 'Ferencváros', 3, 0, 3, 8, 3, null], ['m1', 'Vasas', 2, 1, 1, 0, 2, 120]]);
});

test('what the data cannot give yet is listed, each with the reason and what it waits for', () => {
  assert.ok(NOT_MEASURED.length >= 8);
  for (const row of NOT_MEASURED) assert.ok(row.what && row.why && row.waitsFor);
  const text = NOT_MEASURED.map((row) => row.what).join(' | ');
  for (const needle of ['step', 'Camera permission', 'Shares', 'QR', 'declined', 'Country']) assert.match(text, new RegExp(needle, 'i'));
});
