import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// No test here can send a real e-mail: the sender is a fake, and the provider's key is not in the environment either.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND;
delete process.env.EMAIL_API_KEY;

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const get = (token?: string) => new NextRequest('http://localhost/api/internal/follow-up-emails', { headers: token ? { authorization: `Bearer ${token}` } : {} });

function dayAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function setup(t: TestContext, secret: string | undefined, eventDate: string | null = dayAgo(8), switchedOn = true) {
  const seeded = fakeDb({
    events: [{ _id: new ObjectId(), eventId: 'e1', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu', ...(eventDate ? { eventDate } : {}), ...(switchedOn ? { notifications: { types: { followUp: { enabled: true } } } } : {}) }],
    partners: [{ partnerId: 'P', name: 'MTK' }],
    submissions: [{ _id: new ObjectId(), eventId: 'e1', eventIds: ['e1'], userInfo: { name: 'Ann', email: 'ann@example.com' }, consents: [{ accepted: true }], reviewStatus: 'approved', shareToken: 'tok', createdAt: '2026-10-16T10:00:00.000Z' }],
    admin_settings: [],
    email_follow_ups: [],
  });
  const mails: Array<Record<string, unknown>> = [];
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  delete process.env.FOLLOW_UP_MAX_AGE_DAYS;
  t.after(() => {
    delete process.env.CRON_SECRET;
    delete process.env.FOLLOW_UP_MAX_AGE_DAYS;
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/email/submission-notification', {
    namedExports: {
      sendSubmissionResultEmail: async (input: Record<string, unknown>) => {
        mails.push(input);
        return { sent: true, provider: 'resend', messageId: 'm', recipientEmail: String(input.recipientEmail) };
      },
    },
  });
  return { ...seeded, mails };
}

test('without the cron secret, or with a wrong one, nothing is sent and the answer is 403 (fail closed)', async (t) => {
  const w = setup(t, undefined);
  const { GET } = await load('closed');
  assert.equal((await GET(get())).status, 403, 'CRON_SECRET not set on the project');
  assert.equal((await GET(get('anything'))).status, 403);
  process.env.CRON_SECRET = 'right';
  assert.equal((await GET(get('wrong'))).status, 403);
  assert.equal((await GET(get())).status, 403);
  assert.equal(w.mails.length, 0);
  assert.equal(w.data.email_follow_ups.length, 0);
});

test('with the secret the follow up of the event that switched it on goes once, and running the job again sends nothing', async (t) => {
  const w = setup(t, 'right');
  const { GET } = await load('open');
  const response = await GET(get('right'));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { dryRun: boolean; sent: number; eventsOn: number } };
  assert.equal(body.data.dryRun, false);
  assert.equal(body.data.sent, 1);
  assert.equal(body.data.eventsOn, 1);
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].recipientEmail, 'ann@example.com');
  assert.match(String(w.mails[0].shareUrl), /\/share\/tok$/);
  const again = (await (await GET(get('right'))).json()) as { data: { sent: number; alreadySent: number } };
  assert.equal(again.data.sent, 0);
  assert.equal(again.data.alreadySent, 1);
  assert.equal(w.mails.length, 1, 'once');
});

for (const [name, eventDate, switchedOn] of [['has not switched it on', dayAgo(8), false], ['has no date', null, true], ['is not a week old yet', dayAgo(3), true], ['is far past the window', dayAgo(60), true]] as const) {
  test(`an event that ${name} gets nothing even with the secret`, async (t) => {
    const w = setup(t, 'right', eventDate, switchedOn);
    const { GET } = await load(`nothing-${name.replace(/\W+/g, '-')}`);
    assert.equal((await GET(get('right'))).status, 200);
    assert.equal(w.mails.length, 0);
    assert.equal(w.data.email_follow_ups.length, 0);
  });
}

test('FOLLOW_UP_MAX_AGE_DAYS sets the window: an event 30 days old is sent only when the window reaches it', async (t) => {
  const w = setup(t, 'right', dayAgo(30));
  const { GET } = await load('window');
  await GET(get('right'));
  assert.equal(w.mails.length, 0, 'the standard window is 21 days');
  process.env.FOLLOW_UP_MAX_AGE_DAYS = '45';
  await GET(get('right'));
  assert.equal(w.mails.length, 1);
});
