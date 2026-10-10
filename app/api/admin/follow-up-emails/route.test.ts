import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// No test here can send a real e-mail: the sender is a fake, and the provider's key is not in the environment either.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND;
delete process.env.EMAIL_API_KEY;

const apiReal = await import('@/lib/api');

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/admin/follow-up-emails', { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function setup(t: TestContext, role: 'admin' | 'user') {
  const seeded = fakeDb({
    events: [{ _id: new ObjectId(), eventId: 'e1', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu', eventDate: dayAgo(8), notifications: { types: { followUp: { enabled: true } } } }],
    partners: [{ partnerId: 'P', name: 'MTK' }],
    submissions: [
      { _id: new ObjectId(), eventId: 'e1', eventIds: ['e1'], userInfo: { name: 'Ann', email: 'ann@example.com' }, consents: [{ accepted: true }], reviewStatus: 'approved', createdAt: '2026-10-16T10:00:00.000Z' },
      { _id: new ObjectId(), eventId: 'e1', eventIds: ['e1'], userInfo: { name: 'Bob', email: 'bob@example.com' }, consents: [{ accepted: true }], reviewStatus: 'approved', createdAt: '2026-10-16T10:01:00.000Z' },
    ],
    admin_settings: [],
    email_follow_ups: [],
  });
  const mails: Array<Record<string, unknown>> = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ({ user: { id: 'a1', email: 'x@example.test' }, appRole: role }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => role === 'admin' } });
  t.mock.module('@/lib/email/submission-notification', {
    namedExports: {
      sendSubmissionResultEmail: async (input: Record<string, unknown>) => {
        mails.push(input);
        return { sent: true, provider: 'resend', messageId: 'm', recipientEmail: String(input.recipientEmail) };
      },
    },
  });
  t.after(() => {
    delete process.env.CRON_SECRET;
    delete process.env.FOLLOW_UP_MAX_AGE_DAYS;
  });
  return { ...seeded, mails };
}

type Result = { dryRun: boolean; toSend: number; sent: number; remaining: number; eligible: number };
const result = async (response: Response) => ((await response.json()) as { data: Result }).data;

test('only a global admin may look at or run it', async (t) => {
  const w = setup(t, 'user');
  const { GET, POST } = await load('forbidden');
  assert.equal((await GET(req('GET'))).status, 403);
  assert.equal((await POST(req('POST', { dryRun: false }))).status, 403);
  assert.equal(w.mails.length, 0);
  assert.equal(w.data.email_follow_ups.length, 0);
});

test('GET says what the daily job does and whether it can run by itself, and never gives the secret', async (t) => {
  setup(t, 'admin');
  delete process.env.CRON_SECRET;
  const { GET } = await load('status');
  let body = (await (await GET(req('GET'))).json()) as { data: Record<string, unknown> };
  assert.deepEqual(body.data, { cronConfigured: false, minAgeDays: 7, maxAgeDays: 21, maxSendsPerRun: 120 });
  process.env.CRON_SECRET = 's3cr3t-value-1';
  process.env.FOLLOW_UP_MAX_AGE_DAYS = '30';
  const response = await GET(req('GET'));
  const text = await response.text();
  body = JSON.parse(text) as { data: Record<string, unknown> };
  assert.equal(body.data.cronConfigured, true);
  assert.equal(body.data.maxAgeDays, 30);
  assert.equal(text.includes('s3cr3t-value-1'), false);
});

test('a request that does not say otherwise is a dry run: it counts and sends and writes nothing', async (t) => {
  const w = setup(t, 'admin');
  const { POST } = await load('dry');
  for (const request of [req('POST'), req('POST', {}), req('POST', { dryRun: true })]) {
    const data = await result(await POST(request));
    assert.equal(data.dryRun, true);
    assert.equal(data.toSend, 2);
    assert.equal(data.sent, 0);
  }
  assert.equal(w.mails.length, 0);
  assert.equal(w.data.email_follow_ups.length, 0);
});

test('only { "dryRun": false } sends, and a second press sends nothing more; a dryRun that is not true or false is refused', async (t) => {
  const w = setup(t, 'admin');
  const { POST } = await load('send');
  assert.equal((await POST(req('POST', { dryRun: 'no' }))).status, 400);
  assert.equal((await POST(req('POST', { dryRun: 0 }))).status, 400);
  assert.equal(w.mails.length, 0);
  const sent = await result(await POST(req('POST', { dryRun: false })));
  assert.equal(sent.dryRun, false);
  assert.equal(sent.sent, 2);
  assert.deepEqual(w.mails.map((mail) => mail.recipientEmail).sort(), ['ann@example.com', 'bob@example.com']);
  const again = await result(await POST(req('POST', { dryRun: false })));
  assert.equal(again.sent, 0);
  assert.equal(w.mails.length, 2);
  assert.equal((await result(await POST(req('POST', { dryRun: true })))).toSend, 0, 'a count after the send says there is nothing left');
});
