import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLapTimer } from './server-timing';

test('each lap is the time since the previous one and the header ends with the total', () => {
  let clock = 1000;
  const timer = createLapTimer(() => clock);
  clock = 1004;
  timer.lap('rate');
  clock = 1020;
  timer.lap('slideshow');
  clock = 1300;
  timer.lap('aggregate');
  clock = 1310;
  assert.deepEqual(timer.laps, [['rate', 4], ['slideshow', 16], ['aggregate', 280]]);
  assert.equal(timer.totalMs(), 310);
  assert.equal(timer.header(), 'rate;dur=4, slideshow;dur=16, aggregate;dur=280, total;dur=310');
});
