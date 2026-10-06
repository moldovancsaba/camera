import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROKEN_FRAME_MAX_MEAN,
  BROKEN_FRAME_MAX_STDDEV,
  isBrokenFrame,
  lumaStats,
  runBoundedAttempts,
} from './capture-policy';

function solid(r: number, g: number, b: number, pixels: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < pixels; i += 1) data.push(r, g, b, 255);
  return data;
}

test('a pure black frame is broken', () => {
  const stats = lumaStats(solid(0, 0, 0, 64));
  assert.equal(stats.mean, 0);
  assert.equal(stats.stdDev, 0);
  assert.equal(isBrokenFrame(stats), true);
});

test('a near-black flat frame that a single exact-zero pixel test would let through is broken', () => {
  assert.equal(isBrokenFrame(lumaStats(solid(2, 1, 3, 64))), true);
});

test('empty pixel data counts as broken, never as a good frame', () => {
  assert.equal(isBrokenFrame(lumaStats([])), true);
});

test('a dark scene with detail is not broken', () => {
  // Dark on average (mean about 9) but with bright spots, like a lit face in a dim room.
  const data = [...solid(2, 2, 2, 56), ...solid(60, 55, 50, 8)];
  const stats = lumaStats(data);
  assert.ok(stats.mean < 15);
  assert.ok(stats.stdDev > BROKEN_FRAME_MAX_STDDEV);
  assert.equal(isBrokenFrame(stats), false);
});

test('a bright frame is not broken', () => {
  assert.equal(isBrokenFrame(lumaStats(solid(180, 170, 160, 64))), false);
});

test('thresholds are exclusive at the boundary', () => {
  assert.equal(isBrokenFrame({ mean: BROKEN_FRAME_MAX_MEAN, stdDev: 0 }), false);
  assert.equal(isBrokenFrame({ mean: 0, stdDev: BROKEN_FRAME_MAX_STDDEV }), false);
  assert.equal(isBrokenFrame({ mean: BROKEN_FRAME_MAX_MEAN - 0.1, stdDev: BROKEN_FRAME_MAX_STDDEV - 0.1 }), true);
});

test('runBoundedAttempts stops at the first success', async () => {
  const slept: number[] = [];
  const result = await runBoundedAttempts(
    async (n) => (n === 3 ? 'done' : 'retry'),
    { maxAttempts: 6, delayMs: 120 },
    async (ms) => {
      slept.push(ms);
    }
  );
  assert.deepEqual(result, { ok: true, attempts: 3 });
  assert.deepEqual(slept, [120, 120]);
});

test('runBoundedAttempts gives up after the limit instead of looping forever', async () => {
  let calls = 0;
  const slept: number[] = [];
  const result = await runBoundedAttempts(
    async () => {
      calls += 1;
      return 'retry';
    },
    { maxAttempts: 4, delayMs: 50 },
    async (ms) => {
      slept.push(ms);
    }
  );
  assert.deepEqual(result, { ok: false, attempts: 4 });
  assert.equal(calls, 4);
  assert.deepEqual(slept, [50, 50, 50]);
});

test('runBoundedAttempts does not sleep after a first-try success', async () => {
  const slept: number[] = [];
  const result = await runBoundedAttempts(
    async () => 'done',
    { maxAttempts: 6, delayMs: 120 },
    async (ms) => {
      slept.push(ms);
    }
  );
  assert.deepEqual(result, { ok: true, attempts: 1 });
  assert.deepEqual(slept, []);
});
