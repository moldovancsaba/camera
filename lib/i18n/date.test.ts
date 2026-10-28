import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateTime } from './date';

test('a Hungarian event shows Budapest time, summer and winter, whatever the server time zone is', () => {
  const summer = formatDateTime('2026-10-16T17:00:00.000Z', 'hu');
  assert.match(summer, /2026/);
  assert.match(summer, /19:00/, 'UTC+2 in October');
  const winter = formatDateTime('2026-12-01T17:00:00.000Z', 'hu');
  assert.match(winter, /18:00/, 'UTC+1 in December');
});

test('English formatting is deterministic and invalid dates give nothing', () => {
  const english = formatDateTime('2026-10-16T17:00:00.000Z', 'en');
  assert.equal(english, new Date('2026-10-16T17:00:00.000Z').toLocaleString('en', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  assert.equal(formatDateTime('not a date', 'hu'), '');
  assert.equal(formatDateTime('', 'en'), '');
  assert.ok(formatDateTime('2026-10-16T17:00:00.000Z', 'ar'));
});
