import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const req = (method: string) => new NextRequest('http://localhost/api/admin/activity-log', { method });

function setup(t: TestContext, role: 'admin' | 'user') {
  const seeded = fakeDb({
    activity_log: [
      { at: '2026-10-08T10:00:00.000Z', method: 'PATCH', path: '/a', status: 200, outcome: 'ok', userId: 'u1', userEmail: 'a@example.test', role: 'admin' },
      { at: '2026-10-11T10:00:00.000Z', method: 'POST', path: '/b', status: 500, outcome: 'error', userId: null, userEmail: null, role: null },
    ],
    activity_exports: [{ sentAt: '2026-10-09T06:00:00.000Z', fromAt: null, toAt: '2026-10-09T06:00:00.000Z', rows: 1, to: 'moldovancsaba@gmail.com' }],
  });
  const mails: unknown[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { id: 'a1', email: 'x@example.test' }, appRole: role }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => role === 'admin' } });
  t.mock.module('@/lib/email/send', { namedExports: { sendEmail: async (input: unknown) => { mails.push(input); return { sent: true, messageId: 'm' }; } } });
  return { ...seeded, mails };
}

test('only a global admin may look at or send the log', async (t) => {
  const w = setup(t, 'user');
  const { GET, POST } = await load('forbidden');
  assert.equal((await GET(req('GET'))).status, 403);
  assert.equal((await POST(req('POST'))).status, 403);
  assert.equal(w.mails.length, 0);
});

test('GET says how many records wait for the next export, how many are kept, the last export and the address; it writes nothing', async (t) => {
  const w = setup(t, 'admin');
  const { GET } = await load('summary');
  const body = (await (await GET(req('GET'))).json()) as { data: { waiting: number; kept: number; lastExport: { rows: number }; to: string } };
  assert.equal(body.data.waiting, 1, 'the record after the last export');
  assert.equal(body.data.kept, 2);
  assert.equal(body.data.lastExport.rows, 1);
  assert.equal(body.data.to, 'moldovancsaba@gmail.com');
  assert.equal(w.mails.length, 0);
});

test('Send now is the weekly export: the new record is mailed, the record of the previous export is deleted', async (t) => {
  const w = setup(t, 'admin');
  const { POST } = await load('send');
  const response = await POST(req('POST'));
  assert.equal(response.status, 200);
  assert.equal(w.mails.length, 1);
  assert.deepEqual(w.data.activity_log.map((r) => r.path), ['/b'], 'the record that was mailed last week is gone, this week\'s stays for a week');
  assert.equal(w.data.activity_exports.length, 2);
});
