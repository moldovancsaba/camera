import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanCounterPayload, MAX_COUNTER_LABEL, MAX_COUNTER_TOTAL, MAX_COUNTERS } from './counters-contract';

/** Runs something that may log and returns what it logged (the structured logger writes one JSON line per record). */
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

test('a clean payload passes through unchanged and logs nothing', () => {
  const payload = { totals: { camera_images_taken: 5, camera_gender_female: 2 }, averages: { camera_avg_people_per_image: 1.5 }, labels: { camera_images_taken: 'Camera: images taken', camera_gender_female: 'Camera: gender, Female', camera_avg_people_per_image: 'Camera: average people per image' } };
  const { result, lines } = quiet(() => cleanCounterPayload(payload));
  assert.deepEqual(result, payload);
  assert.deepEqual(lines, []);
});

test('a name that does not match camera_ and lower case snake case is dropped and logged, with its label, and never sent', () => {
  const bad = ['imagesTaken', 'camera_Images', 'camera_', 'camera-images', 'Camera_images', 'camera_images taken', `camera_${'a'.repeat(81)}`, '../camera_x', ''];
  const { result, lines } = quiet(() => cleanCounterPayload({ totals: { camera_ok: 1, ...Object.fromEntries(bad.map((name) => [name, 1])) }, averages: { avgVettingSeconds: 3 }, labels: Object.fromEntries(['camera_ok', 'imagesTaken', 'avgVettingSeconds'].map((name) => [name, `label ${name}`])) }));
  assert.deepEqual(result, { totals: { camera_ok: 1 }, averages: {}, labels: { camera_ok: 'label camera_ok' } });
  assert.equal(lines.length, 1, 'one line per push, not one per name');
  assert.match(lines[0], /messmass\.counter_dropped/);
  assert.match(lines[0], /"dropped":10/);
});

test('a total is a whole number from 0 to a billion; an average is a finite number sent as it is; anything else is dropped', () => {
  const { result } = quiet(() => cleanCounterPayload({
    totals: { camera_a: 2.6, camera_b: -4, camera_c: 5_000_000_000, camera_d: Number.NaN, camera_e: Number.POSITIVE_INFINITY, camera_f: '7', camera_g: null, camera_h: 0 },
    averages: { camera_avg_a: 1.25, camera_avg_b: Number.NaN, camera_avg_c: -2.5 },
  }));
  assert.deepEqual(result.totals, { camera_a: 3, camera_b: 0, camera_c: MAX_COUNTER_TOTAL, camera_h: 0 });
  assert.deepEqual(result.averages, { camera_avg_a: 1.25, camera_avg_c: -2.5 });
});

test('at most 300 names go, the first ones in order (the fixed counters come first), and a name is only counted once', () => {
  const totals = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`camera_n${i}`, i]));
  const { result, lines } = quiet(() => cleanCounterPayload({ totals, averages: { camera_n0: 5, camera_extra: 1 } }));
  assert.equal(Object.keys(result.totals).length, MAX_COUNTERS);
  assert.equal(MAX_COUNTERS, 300);
  assert.equal('camera_n299' in result.totals, true);
  assert.equal('camera_n300' in result.totals, false);
  assert.deepEqual(result.averages, {}, 'the limit is on names, and camera_n0 was already a total');
  assert.match(lines[0], /"dropped":102/);
});

test('a label is trimmed, its spaces collapsed and cut to 80 characters; an empty label and a label of a dropped name are left out', () => {
  const { result } = quiet(() => cleanCounterPayload({ totals: { camera_a: 1, camera_b: 1, camera_c: 1 }, labels: { camera_a: `  Camera:   ${'x'.repeat(200)}  `, camera_b: '   ', camera_c: 5 as unknown as string, camera_gone: 'No total' } }));
  assert.deepEqual(Object.keys(result.labels), ['camera_a']);
  assert.equal(result.labels.camera_a.length <= MAX_COUNTER_LABEL, true);
  assert.ok(result.labels.camera_a.startsWith('Camera: xxx'));
});

test('anything that is not a payload gives an empty one, never an error', () => {
  const { lines } = quiet(() => {
    for (const junk of [null, undefined, {}, { totals: 5, averages: 'x', labels: [] }, { totals: [1, 2] }]) assert.deepEqual(cleanCounterPayload(junk as never).totals, {});
  });
  assert.deepEqual(lines, [], 'nothing was there to drop');
  assert.deepEqual(cleanCounterPayload(null), { totals: {}, averages: {}, labels: {} });
});
