import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTER_NAME_PATTERN, counterKey, resolveVocabulary, STANDARD_VOCABULARY } from '@/lib/photo-vetting/vocabulary';
import type { PhotoFacts } from './facts';
import { buildCounters, COMPUTABLE_COUNTERS, COUNTER_FAMILIES, counterRows, hasCounters, NO_COUNTERS, parseCounterSet, sameCounters, WAITING_COUNTERS } from './counters';
import { MAX_COUNTER_LABEL } from './counters-contract';
import { summarizeJourney } from './journey';
import { buildEventReport } from './report';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'waiting', submittedAt: '2026-10-16T18:00:00.000Z', decisions: [], rejectReasons: [],
  identity: 'email', userKey: 'a@x.test', email: 'a@x.test', consents: [], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 0, lastPlayedAt: null, playsBySlideshow: {}, emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
  ...extra,
});
const report = (photos: PhotoFacts[], vocabulary = STANDARD_VOCABULARY) => buildEventReport({ photos, vocabulary }, { timeZone: 'UTC' });
const consent = { label: 'I accept', pageType: 'accept' as const, at: null };
/** Runs something that may log, and returns what it logged (the structured logger writes one JSON line per record). */
const quiet = <T>(run: () => T): { result: T; lines: string[] } => {
  const lines: string[] = [];
  const real = console.log;
  console.log = (line: unknown) => void lines.push(String(line));
  try {
    return { result: run(), lines };
  } finally {
    console.log = real;
  }
};

const PHOTO_NAMES = ['camera_images_taken', 'camera_images_approved', 'camera_images_rejected', 'camera_images_shown_on_slideshow', 'camera_consents_accepted'];
const REVIEW_QUEUE_NAMES = ['camera_review_queue_under_15m', 'camera_review_queue_15m_1h', 'camera_review_queue_1_6h', 'camera_review_queue_6_24h', 'camera_review_queue_over_24h'];
const JOURNEY_NAMES = ['camera_journey_opens', 'camera_journeys_completed', 'camera_journeys_finished', 'camera_permission_denied', 'camera_retakes', 'camera_consents_abandoned', 'camera_shares', 'camera_downloads'];
test('the fixed counters by their messmass names: photos, journey recording, and rejection reasons', () => {
  assert.deepEqual(COMPUTABLE_COUNTERS.map((c) => [c.key, c.kind]), [
    ['camera_images_taken', 'total'], ['camera_images_approved', 'total'], ['camera_images_rejected', 'total'], ['camera_images_shown_on_slideshow', 'total'], ['camera_images_decided', 'total'], ['camera_vetting_seconds_total', 'total'], ['camera_consents_accepted', 'total'], ['camera_source_visits', 'total'], ['camera_source_photo_submissions', 'total'],
    ['camera_journey_opens', 'total'], ['camera_journeys_completed', 'total'], ['camera_journeys_finished', 'total'], ['camera_permission_denied', 'total'], ['camera_retakes', 'total'], ['camera_consents_abandoned', 'total'], ['camera_shares', 'total'], ['camera_downloads', 'total'],
    ['camera_images_rejected_no_reason', 'total'],
  ]);
});

test('every name carries the camera_ prefix and matches the contract with messmass, every label is readable and short, and no name is used twice', () => {
  const names = COMPUTABLE_COUNTERS.map((c) => c.key);
  for (const c of COMPUTABLE_COUNTERS) {
    assert.match(c.key, COUNTER_NAME_PATTERN, c.key);
    assert.ok(c.key.startsWith('camera_'), c.key);
    assert.ok(c.label.startsWith('Camera: ') && c.label.length <= MAX_COUNTER_LABEL, c.label);
    assert.ok(c.definition.length > 10);
  }
  assert.equal(new Set(names).size, names.length);
  // The names made from the vocabulary: every option of the standard list gives a valid, prefixed name, and none meets a fixed name.
  const made = STANDARD_VOCABULARY.options.map((option) => counterKey(option.group, option.key));
  for (const name of made) assert.match(name, COUNTER_NAME_PATTERN, name);
  assert.equal(new Set([...names, ...made]).size, names.length + made.length);
  // The camelCase names of the first draft are gone for good.
  for (const old of ['imagesTaken', 'avgVettingSeconds', 'journeyOpens', 'cameraDenied', 'consentAbandoned', 'declined<Reason>', 'camera_avg_vetting_seconds', 'camera_avg_people_per_image']) assert.equal(names.includes(old), false, old);
});

test('every name of a full set is camera_ prefixed and matches the pattern, and every name has a label', () => {
  const photos = [photo({ review: 'rejected', rejectReasons: ['nudity'], decisions: [{ action: 'reject', by: 'ann', at: '2026-10-16T18:01:00.000Z', reason: null }] })];
  const set = buildCounters(report(photos), summarizeJourney([{ day: '2026-10-16', name: 'journey.start', key: 'ios', count: 4 }]));
  const names = [...Object.keys(set.totals), ...Object.keys(set.averages)];
  assert.ok(names.length > 40);
  for (const name of names) {
    assert.match(name, COUNTER_NAME_PATTERN, name);
    assert.ok(name.startsWith('camera_'));
    assert.ok(set.labels[name] && set.labels[name].length <= MAX_COUNTER_LABEL, name);
  }
  assert.deepEqual(Object.keys(set.labels).sort(), [...names].sort());
});

test('nothing waits any more: the decline reasons are counted from the list, so the audit list is accounted for in full', () => {
  assert.deepEqual(WAITING_COUNTERS, []);
  assert.deepEqual(COUNTER_FAMILIES.map((f) => f.prefix), ['camera_rejected_']);
  assert.deepEqual(COUNTER_FAMILIES.map((f) => f.group), ['reject_reason']);
});

test('the counters from a report: photos taken, approved and declined now, plays, photos with a consent; the photos decided and their vetting seconds added up (a total, so reports can add events together)', () => {
  const set = buildCounters(report([
    photo({ review: 'approved', plays: 5, consents: [consent], decisions: [{ action: 'approve', by: 'ann', at: '2026-10-16T18:01:30.000Z', reason: null }] }),
    photo({ review: 'rejected', consents: [consent], decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:03:00.000Z', reason: 'Blurry' }] }),
    photo({ review: 'waiting', plays: 0 }),
    photo({ source: 'editor', userKey: null, email: null, identity: 'none', review: 'none', plays: 7 }),
    photo({ excluded: 'archived', review: 'approved', plays: 100 }),
  ]));
  for (const [name, value] of Object.entries({ camera_images_taken: 3, camera_images_approved: 1, camera_images_rejected: 1, camera_images_shown_on_slideshow: 12, camera_consents_accepted: 2 })) assert.equal(set.totals[name], value, name);
  assert.deepEqual(set.averages, {}, 'nothing is sent as an average: partner and organisation reports in messmass add every number up');
  assert.equal(set.totals.camera_images_decided, 2);
  assert.equal(set.totals.camera_vetting_seconds_total, 270, '90 s and 180 s');
  assert.equal(set.labels.camera_vetting_seconds_total, 'Camera: vetting time, all photos (seconds)');
});

test('vetting time with no decided photo behind it is not in the set (not sent as zero), and an empty event sends honest zeros for the photo totals only', () => {
  const set = buildCounters(report([photo()]));
  assert.deepEqual(set.averages, {});
  assert.equal('camera_images_decided' in set.totals || 'camera_vetting_seconds_total' in set.totals, false);
  assert.equal(set.totals.camera_images_taken, 1);
  const empty = buildCounters(report([]));
  assert.deepEqual(empty.totals, { camera_images_taken: 0, camera_images_approved: 0, camera_images_rejected: 0, camera_images_shown_on_slideshow: 0, camera_consents_accepted: 0, camera_review_queue_under_15m: 0, camera_review_queue_15m_1h: 0, camera_review_queue_1_6h: 0, camera_review_queue_6_24h: 0, camera_review_queue_over_24h: 0 });
  assert.deepEqual(Object.keys(empty.labels), [...PHOTO_NAMES, ...REVIEW_QUEUE_NAMES]);
  assert.equal(hasCounters(empty), true);
  assert.equal(hasCounters(NO_COUNTERS), false);
  assert.equal(hasCounters(null), false);
  assert.deepEqual(NO_COUNTERS, { totals: {}, averages: {}, labels: {} });
});

test('no person leaves in the set: only whole numbers under the fixed names, and labels that are words of the list', () => {
  const set = buildCounters(report([photo({ review: 'approved', decisions: [{ action: 'approve', by: 'ann@club.test', at: '2026-10-16T18:01:00.000Z', reason: null }], email: 'fan@x.test' })]));
  const text = JSON.stringify(set);
  assert.ok(!/@|club\.test|x\.test/.test(text), 'no e-mail, reviewer or user in the set');
  assert.ok(Object.values(set.totals).every((v) => Number.isInteger(v) && v >= 0));
});

test('two sets are the same when every number and label is; a missing name or a changed label is a difference; nothing is the same as nothing', () => {
  const a = buildCounters(report([photo()]));
  assert.equal(sameCounters(a, buildCounters(report([photo()]))), true);
  assert.equal(sameCounters(a, buildCounters(report([photo(), photo()]))), false);
  assert.equal(sameCounters(undefined, a), false);
  assert.equal(sameCounters(null, a), false);
  assert.equal(sameCounters({ totals: { camera_images_taken: 1 }, averages: {}, labels: {} }, { totals: { camera_images_taken: 1, camera_images_approved: 0 }, averages: {}, labels: {} }), false);
  assert.equal(sameCounters({ totals: { camera_rejected_nudity: 1 }, averages: {}, labels: { camera_rejected_nudity: 'Camera: rejected, Nudity' } }, { totals: { camera_rejected_nudity: 1 }, averages: {}, labels: { camera_rejected_nudity: 'Camera: rejected, Nudity or sexual content' } }), false, 'a relabelled option is pushed again');
});

test('a stored set is read back defensively', () => {
  assert.equal(parseCounterSet(null), null);
  assert.equal(parseCounterSet('x'), null);
  assert.deepEqual(parseCounterSet({ totals: { camera_images_taken: 3, bad: 'x', worse: Number.NaN }, averages: { camera_avg_vetting_seconds: 10 }, labels: { camera_images_taken: 'Camera: images taken', odd: 5 } }), { totals: { camera_images_taken: 3 }, averages: { camera_avg_vetting_seconds: 10 }, labels: { camera_images_taken: 'Camera: images taken' } });
  assert.deepEqual(parseCounterSet({}), { totals: {}, averages: {}, labels: {} });
});

test('the preview rows carry the value that would be sent, or null, and the label that would go with it', () => {
  const rows = counterRows(buildCounters(report([photo({ review: 'approved', decisions: [{ action: 'approve', by: 'ann', at: '2026-10-16T18:02:00.000Z', reason: null }] })])));
  assert.equal(rows.find((r) => r.key === 'camera_images_approved')?.value, 1);
  assert.equal(rows.find((r) => r.key === 'camera_vetting_seconds_total')?.value, 120);
  assert.equal(rows.find((r) => r.key === 'camera_images_decided')?.value, 1);
  assert.equal(rows.find((r) => r.key === 'camera_images_approved')?.label, 'Camera: images approved');
  assert.equal(counterRows(NO_COUNTERS).every((r) => r.value === null), true);
  assert.equal(new Set(counterRows(NO_COUNTERS).map((r) => r.key)).size, counterRows(NO_COUNTERS).length, 'the keys of the rows are unique');
});

const journey = (rows: Array<[string, string, number]>) => summarizeJourney(rows.map(([name, key, count]) => ({ day: '2026-10-16', name: name as never, key, count })));

test('the journey counters are totals of the recording, only for an event that has a record: none of them is sent as a zero before that', () => {
  const withJourney = buildCounters(report([photo()]), journey([['journey.start', 'ios', 40], ['journey.start', 'android', 10], ['journey.complete', '1-3m', 30], ['camera.permission', 'denied', 3], ['photo.retake', '', 9], ['consent.shown', 'page', 20], ['consent.accept', 'page', 12], ['share.click', 'copy', 5], ['share.click', 'whatsapp', 2], ['download', '', 4]]));
  for (const [name, value] of Object.entries({ camera_images_taken: 1, camera_images_approved: 0, camera_images_rejected: 0, camera_images_shown_on_slideshow: 0, camera_consents_accepted: 0, camera_journey_opens: 50, camera_journeys_completed: 30, camera_journeys_finished: 0, camera_permission_denied: 3, camera_retakes: 9, camera_consents_abandoned: 8, camera_shares: 7, camera_downloads: 4, camera_journey_completed_duration_ms_total: 0, camera_journey_completed_duration_samples: 0, camera_journey_cta_page_visits: 0, camera_journey_cta_clicks: 0, camera_journey_cta_external: 0, camera_journey_cta_continue: 0, camera_journey_cta_returns: 0, camera_journey_step_reach_welcome: 0, camera_journey_auth_google_success: 0, camera_journey_auth_facebook_success: 0, camera_users_identifiable: 1, camera_users_returning: 0, camera_users_new: 1 })) assert.equal(withJourney.totals[name], value, name);

  const without = buildCounters(report([photo()]), journey([]));
  assert.deepEqual(Object.keys(without.totals), [...PHOTO_NAMES, ...REVIEW_QUEUE_NAMES], 'no record of the journey: no journey counter, not even a zero');
  assert.deepEqual(buildCounters(report([photo()])).totals, without.totals);
  assert.deepEqual(buildCounters(report([photo()]), null).totals, without.totals);
});

test('an event that has a record but nobody did the thing sends an honest zero: the recording was running, so zero is a count', () => {
  const set = buildCounters(report([]), journey([['journey.start', 'ios', 1]]));
  assert.equal(set.totals.camera_shares, 0);
  assert.equal(set.totals.camera_downloads, 0);
  assert.equal(set.totals.camera_journey_opens, 1);
});

test('the preview rows show the journey counters as not sent yet while the event has no record', () => {
  const rows = counterRows(buildCounters(report([photo()])));
  for (const key of JOURNEY_NAMES) assert.equal(rows.find((r) => r.key === key)?.value, null, key);
  assert.equal(rows.find((r) => r.key === 'camera_images_taken')?.value, 1);
});

// ---- Why photos were declined (issue 628) ----

test('the reject reasons: one counter for each reason, over the rejected photos that carry it, zero for the others offered; the ones with no reason are counted apart', () => {
  const rejected = (rejectReasons: string[]) => photo({ review: 'rejected', rejectReasons });
  const set = buildCounters(report([rejected(['nudity', 'alcohol']), rejected(['nudity']), rejected([]), photo({ review: 'approved', rejectReasons: ['nudity'] }), photo()]));
  assert.equal(set.totals.camera_rejected_nudity, 2);
  assert.equal(set.totals.camera_rejected_alcohol, 1);
  assert.equal(set.totals.camera_rejected_violence, 0, 'offered, nobody has it');
  assert.equal(set.totals.camera_images_rejected_no_reason, 1);
  assert.equal(set.totals.camera_images_rejected, 3);
  assert.equal(set.labels.camera_rejected_nudity, 'Camera: rejected, Nudity or sexual content');
  assert.equal(set.totals.camera_rejected_other, 0);
});

test('no reason counter while no photo is rejected; a hidden or unknown reason that was used still counts', () => {
  const none = buildCounters(report([photo({ review: 'approved' }), photo()]));
  assert.deepEqual(Object.keys(none.totals).filter((name) => name.startsWith('camera_rejected_') || name === 'camera_images_rejected_no_reason'), []);
  const hidden = resolveVocabulary({ event: { options: [{ group: 'reject_reason', key: 'political', hidden: true }] } });
  const set = buildCounters(report([photo({ review: 'rejected', rejectReasons: ['political', 'gone_since'] }), photo({ review: 'rejected', rejectReasons: ['nudity'] })], hidden), null, hidden);
  assert.equal(set.totals.camera_rejected_political, 1);
  assert.equal(set.totals.camera_rejected_gone_since, 1);
  assert.equal(set.labels.camera_rejected_gone_since, 'Camera: rejected, Gone since');
  assert.equal(set.totals.camera_rejected_nudity, 1);
  const unusedHidden = buildCounters(report([photo({ review: 'rejected', rejectReasons: ['nudity'] })], hidden), null, hidden);
  assert.equal('camera_rejected_political' in unusedHidden.totals, false);
});

test('a name that breaks the contract is dropped and logged, never sent, and the rest of the set is untouched', () => {
  const base = report([photo({ review: 'rejected', rejectReasons: ['nudity'] })]);
  base.vetting.rejectReasons.push({ id: 'Bad Key!', label: 'Bad', count: 1 }, { id: 'x'.repeat(90), label: 'Long', count: 1 });
  const { result, lines } = quiet(() => buildCounters(base));
  assert.equal(result.totals.camera_rejected_nudity, 1);
  assert.equal(Object.keys(result.totals).some((name) => /bad|xxxx/i.test(name)), false);
  for (const name of Object.keys(result.totals)) assert.match(name, COUNTER_NAME_PATTERN);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /messmass\.counter_dropped/);
  assert.equal(quiet(() => buildCounters(report([photo()]))).lines.length, 0, 'a clean set logs nothing');
});

test('the preview rows list fixed counters and rejection reasons, without legacy manual annotations', () => {
  const rows = counterRows(buildCounters(report([photo({ review: 'rejected', rejectReasons: ['nudity'] })])));
  const keys = rows.map((r) => r.key);
  assert.ok(keys.indexOf('camera_images_rejected_no_reason') < keys.indexOf(REVIEW_QUEUE_NAMES[0]));
  assert.deepEqual(keys.slice(-REVIEW_QUEUE_NAMES.length), [...REVIEW_QUEUE_NAMES].sort());
  assert.equal(rows.find((r) => r.key === 'camera_rejected_nudity')?.label, 'Camera: rejected, Nudity or sexual content');
  const bare = counterRows(NO_COUNTERS).map((r) => r.key);
  assert.ok(bare.includes('camera_rejected_<option>'));
  assert.equal(keys.some((key) => /camera_(gender|age|emotion|merch|people)_/.test(key)), false);
  assert.equal(counterRows(buildCounters(report([photo()]))).length, bare.length + REVIEW_QUEUE_NAMES.length, 'the current review queue has its own rows');
});
