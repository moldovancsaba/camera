import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhotoFacts } from './facts';
import { buildCounters, COMPUTABLE_COUNTERS, counterRows, hasCounters, NO_COUNTERS, parseCounterSet, sameCounters, WAITING_COUNTERS } from './counters';
import { summarizeJourney } from './journey';
import { buildEventReport } from './report';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'waiting', submittedAt: '2026-10-16T18:00:00.000Z', decisions: [],
  identity: 'email', userKey: 'a@x.test', email: 'a@x.test', consents: [], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 0, lastPlayedAt: null, playsBySlideshow: {}, people: undefined, peopleBy: null, peopleAt: null, emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
  ...extra,
});
const report = (photos: PhotoFacts[]) => buildEventReport({ photos }, { timeZone: 'UTC' });
const consent = { label: 'I accept', pageType: 'accept' as const, at: null };

test('the counters of the audit list that the data can give, by their messmass names: the photos, then the journey recording', () => {
  assert.deepEqual(COMPUTABLE_COUNTERS.map((c) => [c.key, c.kind]), [
    ['imagesTaken', 'total'], ['imagesApproved', 'total'], ['imagesRejected', 'total'], ['imagesShownOnSlideshow', 'total'], ['avgVettingSeconds', 'average'], ['consentAccepted', 'total'],
    ['journeyOpens', 'total'], ['journeyCompleted', 'total'], ['cameraDenied', 'total'], ['retakes', 'total'], ['consentAbandoned', 'total'], ['shares', 'total'], ['downloads', 'total'],
  ]);
  for (const c of COMPUTABLE_COUNTERS) assert.match(c.key, /^[a-z][A-Za-z0-9]*$/, 'camelCase, as a messmass variable name');
});

test('the whole audit list is accounted for: a counter is either computed or waiting, never both, never lost, and the names are the audit’s', () => {
  const computed = COMPUTABLE_COUNTERS.map((c) => c.key);
  const waiting = WAITING_COUNTERS.map((c) => c.key);
  assert.deepEqual([...computed, ...waiting].sort(), ['avgVettingSeconds', 'cameraDenied', 'consentAbandoned', 'consentAccepted', 'declined<Reason>', 'downloads', 'imagesApproved', 'imagesRejected', 'imagesShownOnSlideshow', 'imagesTaken', 'journeyCompleted', 'journeyOpens', 'retakes', 'shares'].sort());
  assert.equal(new Set([...computed, ...waiting]).size, computed.length + waiting.length);
  for (const w of WAITING_COUNTERS) assert.ok(w.why && w.waitsFor);
});

test('the counters from a report: photos taken, approved and declined now, plays, photos with a consent; the average time to the first decision in whole seconds', () => {
  const set = buildCounters(report([
    photo({ review: 'approved', plays: 5, consents: [consent], decisions: [{ action: 'approve', by: 'ann', at: '2026-10-16T18:01:30.000Z', reason: null }] }),
    photo({ review: 'rejected', consents: [consent], decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:03:00.000Z', reason: 'Blurry' }] }),
    photo({ review: 'waiting', plays: 0 }),
    photo({ source: 'editor', userKey: null, email: null, identity: 'none', review: 'none', plays: 7 }),
    photo({ excluded: 'archived', review: 'approved', plays: 100 }),
  ]));
  assert.deepEqual(set, { totals: { imagesTaken: 3, imagesApproved: 1, imagesRejected: 1, imagesShownOnSlideshow: 12, consentAccepted: 2 }, averages: { avgVettingSeconds: 135 } });
});

test('an average that has no photo behind it is not in the set (not sent as zero), and an empty event sends honest zeros for the totals', () => {
  const set = buildCounters(report([photo()]));
  assert.deepEqual(set.averages, {});
  assert.equal(set.totals.imagesTaken, 1);
  const empty = buildCounters(report([]));
  assert.deepEqual(empty.totals, { imagesTaken: 0, imagesApproved: 0, imagesRejected: 0, imagesShownOnSlideshow: 0, consentAccepted: 0 });
  assert.equal(hasCounters(empty), true);
  assert.equal(hasCounters(NO_COUNTERS), false);
  assert.equal(hasCounters(null), false);
});

test('no person leaves in the set: only numbers under the fixed names', () => {
  const set = buildCounters(report([photo({ review: 'approved', decisions: [{ action: 'approve', by: 'ann@club.test', at: '2026-10-16T18:01:00.000Z', reason: null }], email: 'fan@x.test' })]));
  const text = JSON.stringify(set);
  assert.ok(!/@|ann|fan/.test(text));
  assert.ok(Object.values({ ...set.totals, ...set.averages }).every((v) => Number.isInteger(v) && v >= 0));
});

test('two sets are the same when every number is; a missing name is a difference; nothing is the same as nothing', () => {
  const a = buildCounters(report([photo()]));
  assert.equal(sameCounters(a, buildCounters(report([photo()]))), true);
  assert.equal(sameCounters(a, buildCounters(report([photo(), photo()]))), false);
  assert.equal(sameCounters(undefined, a), false);
  assert.equal(sameCounters(null, a), false);
  assert.equal(sameCounters({ totals: { imagesTaken: 1 }, averages: {} }, { totals: { imagesTaken: 1, imagesApproved: 0 }, averages: {} }), false);
});

test('a stored set is read back defensively', () => {
  assert.equal(parseCounterSet(null), null);
  assert.equal(parseCounterSet('x'), null);
  assert.deepEqual(parseCounterSet({ totals: { imagesTaken: 3, bad: 'x', worse: Number.NaN }, averages: { avgVettingSeconds: 10 } }), { totals: { imagesTaken: 3 }, averages: { avgVettingSeconds: 10 } });
  assert.deepEqual(parseCounterSet({}), { totals: {}, averages: {} });
});

test('the preview rows carry the value that would be sent, or null', () => {
  const rows = counterRows(buildCounters(report([photo({ review: 'approved', decisions: [{ action: 'approve', by: 'ann', at: '2026-10-16T18:02:00.000Z', reason: null }] })])));
  assert.equal(rows.find((r) => r.key === 'imagesApproved')?.value, 1);
  assert.equal(rows.find((r) => r.key === 'avgVettingSeconds')?.value, 120);
  assert.equal(counterRows(NO_COUNTERS).every((r) => r.value === null), true);
});

const journey = (rows: Array<[string, string, number]>) => summarizeJourney(rows.map(([name, key, count]) => ({ day: '2026-10-16', name: name as never, key, count })));

test('the journey counters are totals of the recording, only for an event that has a record: none of them is sent as a zero before that', () => {
  const withJourney = buildCounters(report([photo()]), journey([['journey.start', 'ios', 40], ['journey.start', 'android', 10], ['journey.complete', '1-3m', 30], ['camera.permission', 'denied', 3], ['photo.retake', '', 9], ['consent.shown', 'page', 20], ['consent.accept', 'page', 12], ['share.click', 'copy', 5], ['share.click', 'whatsapp', 2], ['download', '', 4]]));
  assert.deepEqual(withJourney.totals, { imagesTaken: 1, imagesApproved: 0, imagesRejected: 0, imagesShownOnSlideshow: 0, consentAccepted: 0, journeyOpens: 50, journeyCompleted: 30, cameraDenied: 3, retakes: 9, consentAbandoned: 8, shares: 7, downloads: 4 });

  const without = buildCounters(report([photo()]), journey([]));
  assert.deepEqual(Object.keys(without.totals), ['imagesTaken', 'imagesApproved', 'imagesRejected', 'imagesShownOnSlideshow', 'consentAccepted'], 'no record of the journey: no journey counter, not even a zero');
  assert.deepEqual(buildCounters(report([photo()])).totals, without.totals);
  assert.deepEqual(buildCounters(report([photo()]), null).totals, without.totals);
});

test('an event that has a record but nobody did the thing sends an honest zero: the recording was running, so zero is a count', () => {
  const set = buildCounters(report([]), journey([['journey.start', 'ios', 1]]));
  assert.equal(set.totals.shares, 0);
  assert.equal(set.totals.downloads, 0);
  assert.equal(set.totals.journeyOpens, 1);
});

test('the preview rows show the journey counters as not sent yet while the event has no record', () => {
  const rows = counterRows(buildCounters(report([photo()])));
  for (const key of ['journeyOpens', 'journeyCompleted', 'cameraDenied', 'retakes', 'consentAbandoned', 'shares', 'downloads']) assert.equal(rows.find((r) => r.key === key)?.value, null, key);
  assert.equal(rows.find((r) => r.key === 'imagesTaken')?.value, 1);
});

test('the only counter that still waits is the one per decline reason', () => {
  assert.deepEqual(WAITING_COUNTERS.map((c) => c.key), ['declined<Reason>']);
});
