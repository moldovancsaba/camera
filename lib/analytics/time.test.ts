import assert from 'node:assert/strict';
import { test } from 'node:test';
import { average, dayInRange, daysBetween, defaultTimeZone, formatDuration, localParts, median, resolveTimeZone, secondsBetween } from './time';

test('a time is put on the day and hour of the clock of the chosen time zone, so the match evening stays one evening', () => {
  // 21:30 UTC on 16 October is 23:30 in Budapest (summer time, UTC+2); 22:30 UTC is already the 17th, 00:30, there.
  assert.deepEqual(localParts('2026-10-16T21:30:00.000Z', 'Europe/Budapest'), { day: '2026-10-16', hour: 23 });
  assert.deepEqual(localParts('2026-10-16T22:30:00.000Z', 'Europe/Budapest'), { day: '2026-10-17', hour: 0 });
  assert.deepEqual(localParts('2026-10-16T22:30:00.000Z', 'UTC'), { day: '2026-10-16', hour: 22 });
  assert.deepEqual(localParts('2026-01-15T23:59:59.999Z', 'Europe/Budapest'), { day: '2026-01-16', hour: 0 }, 'winter time is UTC+1');
});

test('a missing or invalid time has no day', () => {
  assert.equal(localParts(null, 'UTC'), null);
  assert.equal(localParts('', 'UTC'), null);
  assert.equal(localParts('not a time', 'UTC'), null);
  assert.equal(localParts(12, 'UTC'), null);
});

test('the clock offered: Budapest for a Hungarian event, UTC otherwise; only the offered clocks are accepted', () => {
  assert.equal(defaultTimeZone('hu'), 'Europe/Budapest');
  assert.equal(defaultTimeZone('en'), 'UTC');
  assert.equal(defaultTimeZone(undefined), 'UTC');
  assert.equal(resolveTimeZone('Europe/Budapest', 'UTC'), 'Europe/Budapest');
  assert.equal(resolveTimeZone('America/New_York', 'UTC'), 'UTC');
  assert.equal(resolveTimeZone(undefined, 'Europe/Budapest'), 'Europe/Budapest');
});

test('seconds between two times; a clock slip (the second is earlier) or an invalid time is not a duration', () => {
  assert.equal(secondsBetween('2026-10-16T18:00:00.000Z', '2026-10-16T18:02:00.400Z'), 120);
  assert.equal(secondsBetween('2026-10-16T18:00:00.000Z', '2026-10-16T18:00:00.000Z'), 0);
  assert.equal(secondsBetween('2026-10-16T18:02:00.000Z', '2026-10-16T18:00:00.000Z'), null);
  assert.equal(secondsBetween('x', '2026-10-16T18:00:00.000Z'), null);
  assert.equal(secondsBetween(undefined, undefined), null);
});

test('average and median', () => {
  assert.equal(average([]), null);
  assert.equal(average([1, 2, 4]), 2.3);
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('the end day of a range is included (the old report compared a plain date with a time and left it out)', () => {
  assert.equal(dayInRange('2026-10-16', '2026-10-16', '2026-10-16'), true);
  assert.equal(dayInRange('2026-10-15', '2026-10-16', null), false);
  assert.equal(dayInRange('2026-10-17', null, '2026-10-16'), false);
  assert.equal(dayInRange('2026-10-17', '', ''), true);
  assert.equal(dayInRange('2026-10-17', 'garbage', 'also garbage'), true, 'a malformed end is ignored');
});

test('days between two days, both included, with a limit', () => {
  assert.deepEqual(daysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(daysBetween('2026-10-16', '2026-10-16'), ['2026-10-16']);
  assert.deepEqual(daysBetween('2026-10-17', '2026-10-16'), []);
  assert.equal(daysBetween('2020-01-01', '2026-12-31', 10).length, 10);
  assert.deepEqual(daysBetween('x', 'y'), []);
});

test('a duration in words', () => {
  assert.equal(formatDuration(null), 'n/a');
  assert.equal(formatDuration(undefined), 'n/a');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(120), '2 min');
  assert.equal(formatDuration(125), '2 min 5 s');
  assert.equal(formatDuration(4800), '1 h 20 min');
  assert.equal(formatDuration(7200), '2 h');
  assert.equal(formatDuration(2 * 86400 + 3 * 3600), '2 d 3 h');
});
