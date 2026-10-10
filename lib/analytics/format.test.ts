import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCount, formatDateTime, formatDay, formatHour, formatRate, formatShare } from './format';

test('numbers, shares and rates; no whole means n/a, never 0 or NaN', () => {
  assert.equal(formatCount(1234), '1,234');
  assert.equal(formatCount(2.25), '2.3');
  assert.equal(formatCount(null), 'n/a');
  assert.equal(formatCount(Number.NaN), 'n/a');
  assert.equal(formatShare(1, 3), '33 %');
  assert.equal(formatShare(0, 0), 'n/a');
  assert.equal(formatRate(0.666), '67 %');
  assert.equal(formatRate(null), 'n/a');
});

test('days, times and hours', () => {
  assert.equal(formatDay('2026-10-16'), 'Fri 16 Oct');
  assert.equal(formatDay('garbage'), 'garbage');
  assert.equal(formatDateTime('2026-10-16T18:15:00.000Z', 'Europe/Budapest'), '16 Oct 2026, 20:15');
  assert.equal(formatDateTime('2026-10-16T18:15:00.000Z', 'UTC'), '16 Oct 2026, 18:15');
  assert.equal(formatDateTime(null, 'UTC'), 'n/a');
  assert.equal(formatHour(7), '07:00');
});
