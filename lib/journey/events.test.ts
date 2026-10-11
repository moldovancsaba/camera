import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOURNEY_MAX_BYTES, JOURNEY_MAX_EVENTS, JOURNEY_MAX_MS, JOURNEY_NAMES, JOURNEY_VOCABULARY, NO_KEY, STEP_KEYS, clampMs, isJourneyKey, parseJourneyBatch, timeBucketOf } from './events';

const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const EVENT = '66f000000000000000000001';
const body = (ev: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, s: SESSION, e: EVENT, ev, ...extra });

test('a valid batch is read as it was sent: names, keys and times', () => {
  const batch = parseJourneyBatch(body([['journey.start', null, 0], ['step.reach', 'camera', 1500], ['photo.taken', 'system', 5200], ['share.click', 'whatsapp', 9000]]));
  assert.ok(batch);
  assert.equal(batch.session, SESSION);
  assert.equal(batch.event, EVENT);
  assert.deepEqual(batch.events.map((e) => [e.name, e.key, e.ms]), [['journey.start', NO_KEY, 0], ['step.reach', 'camera', 1500], ['photo.taken', 'system', 5200], ['share.click', 'whatsapp', 9000]]);
});

test('a name that is not in the vocabulary, a key that is not in its list and a name the server alone may record are dropped; the others stay', () => {
  const batch = parseJourneyBatch(body([
    ['step.reach', 'camera', 10],
    ['step.reach', 'not-a-step', 20],
    ['page.view', null, 30],
    ['share.view', null, 40],
    ['download', null, 50],
    ['photo.retake', 'something', 60],
    ['share.click', 'carrier-pigeon', 70],
    ['consent.accept', 'box', 80],
  ]));
  assert.ok(batch);
  assert.deepEqual(batch.events.map((e) => `${e.name}:${e.key}`), ['step.reach:camera', 'consent.accept:box']);
});

test('the key of a journey.start is made by the server: whatever the browser sent there is ignored', () => {
  const batch = parseJourneyBatch(body([['journey.start', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)', 0]]));
  assert.ok(batch);
  assert.equal(batch.events[0].key, NO_KEY);
  assert.equal(JSON.stringify(batch).includes('Mozilla'), false);
});

test('no free text can get through: every kept key is one of the fixed words of its name', () => {
  const junk = ['<script>alert(1)</script>', 'person@example.test', '203.0.113.7', 'x'.repeat(500), '', '  ', 'camera ', 'CAMERA'];
  for (const name of JOURNEY_NAMES) {
    const batch = parseJourneyBatch(body(junk.map((key) => [name, key, 1])));
    for (const event of batch?.events ?? []) {
      const keys = JOURNEY_VOCABULARY[event.name].keys as readonly string[] | null;
      assert.ok(keys === null || keys.includes(event.key) || event.name === 'journey.start', `${event.name}:${event.key}`);
    }
  }
});

test('the time is a whole number from 0 to six hours; anything else is 0', () => {
  assert.equal(clampMs(1234.6), 1235);
  assert.equal(clampMs(-5), 0);
  assert.equal(clampMs(Number.NaN), 0);
  assert.equal(clampMs('12'), 0);
  assert.equal(clampMs(JOURNEY_MAX_MS * 10), JOURNEY_MAX_MS);
});

test('a batch is cut at the most records, and refused when it is not a batch, is too big or has no valid record', () => {
  const many = Array.from({ length: 100 }, () => ['photo.retake', null, 1]);
  assert.equal(parseJourneyBatch(body(many))?.events.length, JOURNEY_MAX_EVENTS);
  assert.equal(parseJourneyBatch('not json'), null);
  assert.equal(parseJourneyBatch(''), null);
  assert.equal(parseJourneyBatch('[]'), null);
  assert.equal(parseJourneyBatch(JSON.stringify({ v: 2, s: SESSION, e: EVENT, ev: [['photo.retake', null, 1]] })), null, 'wrong version');
  assert.equal(parseJourneyBatch(body([['page.view', null, 1]])), null, 'no valid record');
  assert.equal(parseJourneyBatch(body([['photo.retake', null, 1]], { pad: 'x'.repeat(JOURNEY_MAX_BYTES) })), null, 'too big');
});

test('the visit id and the event are plain ids; anything with other characters is refused', () => {
  for (const s of ['short', 'has space in it 12345', 'a'.repeat(65), '../../etc/passwd', '']) assert.equal(parseJourneyBatch(JSON.stringify({ v: 1, s, e: EVENT, ev: [['photo.retake', null, 1]] })), null, s);
  for (const e of ['x', 'a b c d e f g h', '{"$ne":null}', '66f0000000000000000000010000000000000000000000000000000000000000000']) assert.equal(parseJourneyBatch(JSON.stringify({ v: 1, s: SESSION, e, ev: [['photo.retake', null, 1]] })), null, e);
});

test('a record that is not a list, or whose name is not a text, is skipped without failing the batch', () => {
  const batch = parseJourneyBatch(body(['photo.retake', { name: 'photo.retake' }, null, 7, [123, null, 1], [['photo.retake']], ['photo.retake', null, 5]]));
  assert.deepEqual(batch?.events.map((e) => e.name), ['photo.retake']);
});

test('isJourneyKey: a name without keys takes none; a name with keys takes only those', () => {
  assert.equal(isJourneyKey('photo.retake', null), true);
  assert.equal(isJourneyKey('photo.retake', ''), true);
  assert.equal(isJourneyKey('photo.retake', 'x'), false);
  assert.equal(isJourneyKey('step.reach', 'camera'), true);
  assert.equal(isJourneyKey('step.reach', null), false);
  assert.equal(isJourneyKey('step.reach', 'nope'), false);
});

test('the vocabulary: the funnel steps are the ones the page can reach, the server-only names cannot be sent', () => {
  assert.ok(STEP_KEYS.includes('camera') && STEP_KEYS.includes('saved'));
  assert.deepEqual(JOURNEY_NAMES.filter((name) => JOURNEY_VOCABULARY[name].from === 'server'), ['share.view', 'download']);
});

test('how long it took is put into the five buckets of the view', () => {
  assert.equal(timeBucketOf(0), 'under-1m');
  assert.equal(timeBucketOf(59_999), 'under-1m');
  assert.equal(timeBucketOf(60_000), '1-3m');
  assert.equal(timeBucketOf(179_999), '1-3m');
  assert.equal(timeBucketOf(180_000), '3-10m');
  assert.equal(timeBucketOf(600_000), '10-30m');
  assert.equal(timeBucketOf(1_800_000), 'over-30m');
  assert.equal(timeBucketOf(Number.NaN), 'under-1m');
});
