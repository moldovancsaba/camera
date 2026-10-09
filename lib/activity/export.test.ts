import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import type { SendEmailInput, SendEmailResult } from '@/lib/email/send';
import { ACTIVITY_EXPORT_DEFAULT_TO, exportActivity } from './export';
import type { ActivityRecord } from './log';

const rec = (at: string, over: Partial<ActivityRecord> = {}): ActivityRecord => ({ at, method: 'PATCH', path: '/api/slideshows?id=a', status: 200, outcome: 'ok', userId: 'u1', userEmail: 'admin@example.test', role: 'admin', ...over });

function setup(rows: ActivityRecord[], exports: Array<Record<string, unknown>> = [], send: (i: SendEmailInput) => Promise<SendEmailResult> = async () => ({ sent: true, messageId: 'm1' })) {
  const seeded = fakeDb({ activity_log: rows.map((r) => ({ ...r })), activity_exports: exports });
  const mails: SendEmailInput[] = [];
  const deps = { send: async (i: SendEmailInput) => { mails.push(i); return send(i); }, now: () => new Date('2026-10-12T06:00:00.000Z'), to: ACTIVITY_EXPORT_DEFAULT_TO };
  return { ...seeded, mails, deps };
}

test('the first export mails everything as one CSV attachment to the owner, and records itself; nothing is deleted yet', async () => {
  const w = setup([rec('2026-10-06T10:00:00.000Z'), rec('2026-10-08T10:00:00.000Z', { status: 500, outcome: 'error', message: 'Internal server error' })]);
  const out = await exportActivity(w.db, w.deps);
  assert.deepEqual(out, { ok: true, rows: 2, fromAt: null, toAt: '2026-10-12T06:00:00.000Z', deleted: 0 });
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, 'moldovancsaba@gmail.com');
  assert.match(w.mails[0].subject, /2 records/);
  const file = w.mails[0].attachments?.[0];
  assert.equal(file?.filename, 'camera-activity-2026-10-12.csv');
  assert.equal(String(file?.content).split('\r\n').length, 4, 'header, two records, the final line end');
  assert.equal(w.data.activity_log.length, 2);
  assert.equal(w.data.activity_exports.length, 1);
  assert.deepEqual(w.data.activity_exports[0], { sentAt: '2026-10-12T06:00:00.000Z', fromAt: null, toAt: '2026-10-12T06:00:00.000Z', rows: 2, to: 'moldovancsaba@gmail.com' });
});

test('the next export mails only what is new, and deletes the records of the PREVIOUS export, after the mail went (kept for a week, deleted when the next is sent)', async () => {
  const w = setup(
    [rec('2026-10-06T10:00:00.000Z'), rec('2026-10-08T10:00:00.000Z'), rec('2026-10-10T10:00:00.000Z'), rec('2026-10-11T10:00:00.000Z')],
    [{ sentAt: '2026-10-09T06:00:00.000Z', fromAt: null, toAt: '2026-10-09T06:00:00.000Z', rows: 2, to: ACTIVITY_EXPORT_DEFAULT_TO }]
  );
  const out = await exportActivity(w.db, w.deps);
  assert.deepEqual(out, { ok: true, rows: 2, fromAt: '2026-10-09T06:00:00.000Z', toAt: '2026-10-12T06:00:00.000Z', deleted: 2 });
  assert.equal(String(w.mails[0].attachments?.[0].content).split('\r\n').length, 4, 'two new records');
  assert.deepEqual(w.data.activity_log.map((r) => r.at), ['2026-10-10T10:00:00.000Z', '2026-10-11T10:00:00.000Z'], 'the two of the first period are gone, the two just mailed stay for a week');
  assert.equal(w.data.activity_exports.length, 2);
});

test('a mail that could not be sent writes nothing and deletes nothing, so the next run covers the same period', async () => {
  const w = setup([rec('2026-10-06T10:00:00.000Z'), rec('2026-10-10T10:00:00.000Z')], [{ sentAt: 'x', fromAt: null, toAt: '2026-10-09T06:00:00.000Z', rows: 1, to: 'a' }], async () => ({ sent: false, error: 'missing_api_key' }));
  const out = await exportActivity(w.db, w.deps);
  assert.deepEqual(out, { ok: false, error: 'missing_api_key' });
  assert.equal(w.data.activity_log.length, 2);
  assert.equal(w.data.activity_exports.length, 1);
});

test('a week with no activity is still mailed (so the owner knows it ran), with an empty CSV', async () => {
  const w = setup([]);
  const out = await exportActivity(w.db, w.deps);
  assert.equal(out.ok && out.rows, 0);
  assert.equal(String(w.mails[0].attachments?.[0].content), 'at,who,user_id,role,method,path,status,outcome,message\r\n');
  assert.match(w.mails[0].text ?? '', /0 records/);
});
