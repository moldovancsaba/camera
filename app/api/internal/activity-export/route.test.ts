import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const get = (token?: string) => new NextRequest('http://localhost/api/internal/activity-export', { headers: token ? { authorization: `Bearer ${token}` } : {} });

function setup(t: TestContext, secret: string | undefined, sendResult: { sent: boolean; error?: string } = { sent: true }) {
  const seeded = fakeDb({ activity_log: [{ at: '2026-10-08T10:00:00.000Z', method: 'PATCH', path: '/api/slideshows?id=a', status: 200, outcome: 'ok', userId: 'u1', userEmail: 'a@example.test', role: 'admin' }] });
  const mails: Array<Record<string, unknown>> = [];
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  t.after(() => { delete process.env.CRON_SECRET; delete process.env.ACTIVITY_EXPORT_TO; });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/email/send', { namedExports: { sendEmail: async (input: Record<string, unknown>) => { mails.push(input); return sendResult.sent ? { sent: true, messageId: 'm' } : { sent: false, error: sendResult.error ?? 'x' }; } } });
  return { ...seeded, mails };
}

test('without the cron secret, or with a wrong one, nothing is mailed and the answer is 403 (fail closed)', async (t) => {
  const w = setup(t, undefined);
  const { GET } = await load('closed');
  assert.equal((await GET(get())).status, 403, 'CRON_SECRET not set on the project');
  process.env.CRON_SECRET = 'right';
  assert.equal((await GET(get('wrong'))).status, 403);
  assert.equal((await GET(get())).status, 403);
  assert.equal(w.mails.length, 0);
});

test('with the secret the week is mailed to the owner as a CSV and recorded; ACTIVITY_EXPORT_TO overrides the address', async (t) => {
  const w = setup(t, 'right');
  const { GET } = await load('open');
  const response = await GET(get('right'));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { rows: number } };
  assert.equal(body.data.rows, 1);
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, 'moldovancsaba@gmail.com');
  assert.equal(w.data.activity_exports.length, 1);
});

test('a mail that fails answers 502 and writes nothing, so the next run covers the same period', async (t) => {
  const w = setup(t, 'right', { sent: false, error: 'missing_api_key' });
  const { GET } = await load('fails');
  const response = await GET(get('right'));
  assert.equal(response.status, 502);
  assert.equal(w.data.activity_exports?.length ?? 0, 0);
  assert.equal(w.data.activity_log.length, 1);
});
