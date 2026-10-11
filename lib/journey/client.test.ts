import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOURNEY_MAX_BYTES, JOURNEY_MAX_EVENTS, parseJourneyBatch } from './events';
import { FLUSH_DELAY_MS, MAX_RECORDS_PER_VISIT, createJourneyRecorder, type JourneyDeps } from './client';

/** A recorder on a fake clock and a fake network: the timers run when the test says, a request ends when the test says. */
function harness(overrides: Partial<JourneyDeps> = {}) {
  let time = 1000;
  const timers: Array<{ at: number; task: () => void; id: number }> = [];
  let nextTimer = 1;
  const requests: Array<{ body: string; done: () => void }> = [];
  const beacons: string[] = [];
  const deps: JourneyDeps = {
    now: () => time,
    newVisitId: () => '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f',
    setTimer: (task, ms) => {
      const id = nextTimer++;
      timers.push({ at: time + ms, task, id });
      return id;
    },
    clearTimer: (handle) => {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    request: (body, done) => {
      requests.push({ body, done });
    },
    beacon: (body) => {
      beacons.push(body);
      return true;
    },
    ...overrides,
  };
  const recorder = createJourneyRecorder(deps);
  const advance = (ms: number) => {
    time += ms;
    for (const due of timers.filter((t) => t.at <= time).sort((a, b) => a.at - b.at)) {
      timers.splice(timers.indexOf(due), 1);
      due.task();
    }
  };
  const sent = () => requests.map((r) => parseJourneyBatch(r.body));
  return { recorder, advance, requests, beacons, timers, sent, setTime: (t: number) => { time = t; } };
}

const EVENT = '66f000000000000000000001';

test('nothing is recorded or sent until the recording is started; a switched-off recording sends not one byte', () => {
  const h = harness();
  h.recorder.record('step.reach', 'camera');
  h.recorder.once('consent.shown', 'page');
  h.recorder.saved(true);
  h.advance(60_000);
  h.recorder.flushNow();
  assert.equal(h.requests.length, 0);
  assert.equal(h.beacons.length, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(h.recorder.running, false);
});

test('start records the visit once, and the records of a step change go out together after a short wait, not one request each', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.start({ eventId: EVENT });
  h.recorder.record('step.reach', 'welcome');
  h.advance(300);
  h.recorder.record('step.reach', 'consent');
  assert.equal(h.requests.length, 0, 'still waiting');
  h.advance(FLUSH_DELAY_MS);
  assert.equal(h.requests.length, 1);
  const batch = h.sent()[0];
  assert.ok(batch);
  assert.equal(batch.event, EVENT);
  assert.deepEqual(batch.events.map((e) => `${e.name}:${e.key}`), ['journey.start:', 'step.reach:welcome', 'step.reach:consent']);
  assert.deepEqual(batch.events.map((e) => e.ms), [0, 0, 300], 'milliseconds since the page opened');
});

test('a record that is not in the vocabulary, a key that is not its own and a name only the server may record are dropped, silently', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.record('step.reach', 'not-a-step');
  h.recorder.record('share.click', 'carrier-pigeon');
  h.recorder.record('photo.retake', 'x');
  h.recorder.record('share.view');
  h.recorder.record('download');
  h.recorder.record('no.such.name' as never);
  h.advance(FLUSH_DELAY_MS);
  assert.deepEqual(h.sent()[0]?.events.map((e) => e.name), ['journey.start']);
});

test('only one request is out at a time: while one waits for its answer the records wait, and go when it is over', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.advance(FLUSH_DELAY_MS);
  assert.equal(h.requests.length, 1);
  h.recorder.record('step.reach', 'camera');
  h.advance(FLUSH_DELAY_MS * 3);
  assert.equal(h.requests.length, 1, 'the first has not answered: no second request');
  h.requests[0].done();
  h.advance(FLUSH_DELAY_MS);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.sent()[1]?.events.map((e) => e.name), ['step.reach']);
});

test('a server that never answers costs a bounded number of requests: one at a time, and a visit never sends more than its cap of records', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  for (let i = 0; i < 500; i += 1) {
    h.recorder.record('photo.retake');
    h.advance(FLUSH_DELAY_MS);
  }
  assert.equal(h.requests.length, 1, 'the one request never ended, so it is the only one');
  h.requests[0].done();
  for (let i = 0; i < 20; i += 1) {
    h.advance(FLUSH_DELAY_MS);
    h.requests.at(-1)?.done();
  }
  const total = h.sent().reduce((n, b) => n + (b?.events.length ?? 0), 0);
  assert.ok(total <= MAX_RECORDS_PER_VISIT, `sent ${total} records`);
  assert.ok(h.requests.every((r) => r.body.length <= JOURNEY_MAX_BYTES));
  assert.ok(h.sent().every((b) => (b?.events.length ?? 0) <= JOURNEY_MAX_EVENTS));
});

test('once records the first time only, for each name and key', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  for (let i = 0; i < 5; i += 1) h.recorder.once('step.reach', 'camera');
  h.recorder.once('step.reach', 'reframe');
  h.recorder.once('consent.shown', 'page');
  h.recorder.once('consent.shown', 'box');
  h.advance(FLUSH_DELAY_MS);
  assert.deepEqual(h.sent()[0]?.events.map((e) => `${e.name}:${e.key}`), ['journey.start:', 'step.reach:camera', 'step.reach:reframe', 'consent.shown:page', 'consent.shown:box']);
});

test('the first saved photo records how long the visit took; a failed save records the failure and no completion', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.saved(false);
  h.advance(2 * 60_000);
  h.recorder.saved(true);
  h.recorder.saved(true);
  h.recorder.flushNow();
  const names = [...h.requests.map((r) => r.body), ...h.beacons].map((b) => parseJourneyBatch(b)!.events.map((e) => `${e.name}:${e.key}`)).flat();
  assert.deepEqual(names, ['journey.start:', 'photo.save:failed', 'photo.save:ok', 'journey.complete:1-3m', 'photo.save:ok']);
});

test('a return from a sign-in is a journey.resume, not a visit', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT, resumed: true });
  h.advance(FLUSH_DELAY_MS);
  assert.deepEqual(h.sent()[0]?.events.map((e) => e.name), ['journey.resume']);
});

test('when the page is hidden or closed what waits goes out at once in a beacon, and the timer is gone', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.record('share.click', 'copy');
  h.recorder.flushNow();
  assert.equal(h.beacons.length, 1);
  assert.deepEqual(parseJourneyBatch(h.beacons[0])?.events.map((e) => e.name), ['journey.start', 'share.click']);
  assert.equal(h.timers.length, 0);
  h.recorder.flushNow();
  assert.equal(h.beacons.length, 1, 'nothing is sent twice');
});

test('a beacon the browser refuses falls back to the bounded request', () => {
  const h = harness({ beacon: () => false });
  h.recorder.start({ eventId: EVENT });
  h.recorder.flushNow();
  assert.equal(h.requests.length, 1);
});

test('NEVER THROWS: a clock, a timer, a request or a beacon that throws does not reach the page', () => {
  const broken = (): never => {
    throw new Error('browser says no');
  };
  for (const overrides of [{ now: broken }, { setTimer: broken }, { request: broken }, { beacon: broken }, { newVisitId: broken }, { clearTimer: broken }] as Array<Partial<JourneyDeps>>) {
    const h = harness(overrides);
    assert.doesNotThrow(() => {
      h.recorder.start({ eventId: EVENT });
      h.recorder.record('step.reach', 'camera');
      h.recorder.once('consent.shown', 'page');
      h.recorder.saved(true);
      h.advance(FLUSH_DELAY_MS * 2);
      h.recorder.flushNow();
      h.recorder.flushNow();
    }, Object.keys(overrides)[0]);
  }
});

test('a request that throws frees the line: the next records still go', () => {
  let calls = 0;
  const h = harness({ request: (body, done) => { calls += 1; if (calls === 1) throw new Error('fetch is blocked'); void body; done(); } });
  h.recorder.start({ eventId: EVENT });
  h.advance(FLUSH_DELAY_MS);
  h.recorder.record('step.reach', 'camera');
  h.advance(FLUSH_DELAY_MS * 2);
  assert.equal(calls >= 2, true);
});

test('another event in the same page load is a new visit: the old one is sent first, the counters start again', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.once('step.reach', 'camera');
  h.recorder.start({ eventId: '66f000000000000000000002' });
  h.recorder.once('step.reach', 'camera');
  h.recorder.flushNow();
  assert.equal(h.beacons.length, 2);
  assert.equal(parseJourneyBatch(h.beacons[0])?.event, EVENT);
  assert.equal(parseJourneyBatch(h.beacons[1])?.event, '66f000000000000000000002');
  assert.deepEqual(parseJourneyBatch(h.beacons[1])?.events.map((e) => e.name), ['journey.start', 'step.reach']);
});

test('what is sent holds no page address, no text of the user, no device: only the visit id, the event, names, fixed keys and times', () => {
  const h = harness();
  h.recorder.start({ eventId: EVENT });
  h.recorder.once('step.reach', 'who-are-you');
  h.recorder.record('photo.taken', 'system');
  h.recorder.saved(true);
  h.recorder.flushNow();
  const text = h.beacons.join('');
  for (const forbidden of ['http', 'mail', '@', 'Mozilla', 'navigator', 'cookie', 'name":"']) assert.equal(text.includes(forbidden), false, forbidden);
  assert.deepEqual(Object.keys(JSON.parse(h.beacons[0])).sort(), ['e', 'ev', 's', 'v']);
});
