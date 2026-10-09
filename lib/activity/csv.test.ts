import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_CSV_HEADER, activityCsv } from './csv';
import type { ActivityRecord } from './log';

const rec = (over: Partial<ActivityRecord> = {}): ActivityRecord => ({ at: '2026-10-09T20:00:00.000Z', method: 'PATCH', path: '/api/slideshows?id=abc', status: 200, outcome: 'ok', userId: 'u1', userEmail: 'admin@example.test', role: 'admin', ...over });

test('a header row and one line per record, with a Windows line end the spreadsheets read', () => {
  const csv = activityCsv([rec(), rec({ at: '2026-10-09T21:00:00.000Z', status: 403, outcome: 'refused', message: 'Forbidden' })]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], ACTIVITY_CSV_HEADER.join(','));
  assert.equal(lines[1], '2026-10-09T20:00:00.000Z,admin@example.test,u1,admin,PATCH,/api/slideshows?id=abc,200,ok,');
  assert.equal(lines[2], '2026-10-09T21:00:00.000Z,admin@example.test,u1,admin,PATCH,/api/slideshows?id=abc,403,refused,Forbidden');
  assert.equal(lines[3], '', 'ends with a line end');
  assert.equal(activityCsv([]), `${ACTIVITY_CSV_HEADER.join(',')}\r\n`);
});

test('commas, quotes and line breaks are quoted, and nothing a message says can become a formula', () => {
  const csv = activityCsv([rec({ status: 500, outcome: 'error', message: 'a, "b"\nc' }), rec({ status: 400, outcome: 'refused', message: '=HYPERLINK("http://x","y")' }), rec({ message: '+1', status: 400, outcome: 'refused', userEmail: '@a' })]);
  const lines = csv.split('\r\n');
  assert.ok(csv.includes('"a, ""b""\nc"'));
  assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""http://x"",""y"")"`)), 'a leading = is defused with a quote');
  assert.ok(lines.some((l) => l.includes(",'+1")), 'a leading + too');
  assert.ok(lines.some((l) => l.includes(",'@a,")), 'and a leading @');
});
