import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveEventTheme } from '@/lib/theme/event-theme';
import type { SubmissionNotificationInput, SubmissionNotificationResult } from '@/lib/email/submission-notification';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const EDITOR = { appRole: 'admin', user: { id: 'a1', email: 'editor@example.com', name: 'Edit Or' } };
const NO_EMAIL = { appRole: 'admin', user: { id: 'a2', email: '', name: 'Nobody' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { session?: typeof EDITOR; allowed?: boolean; result?: SubmissionNotificationResult } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu', shortUrlSlug: 'mtk', frameDesign: { context: { event: { homeTeam: { name: 'MTK' }, visitorTeam: { name: 'Vasas' } } } } }],
    partners: [{ partnerId: 'P', name: 'MTK', emailLegal: { hu: 'MTK jogi rész' } }],
    admin_settings: [],
  });
  const sent: SubmissionNotificationInput[] = [];
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => options.session ?? EDITOR, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/theme/load', { namedExports: { loadEventTheme: async () => resolveEventTheme({}) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _s: unknown, role: string) => {
        roles.push(role);
        return { allowed: options.allowed ?? true, role: 'admin', partnerId: 'P' };
      },
    },
  });
  t.mock.module('@/lib/email/submission-notification', {
    namedExports: { sendSubmissionResultEmail: async (input: SubmissionNotificationInput) => (sent.push(input), options.result ?? { sent: true, provider: 'resend', messageId: 'm', recipientEmail: input.recipientEmail ?? '' }) },
  });
  return { sent, roles };
}
const url = 'http://localhost/api/admin/emails/test';
const post = (body: unknown) => new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the test e-mail goes to the signed-in editor and nobody else, with [Test] in front of the subject, in the look and with the data of the event', async (t) => {
  const { sent, roles } = setup(t);
  const { POST } = await importRoute('event');
  const response = await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 'Hi {name}', body: 'Go {home}!', recipientEmail: 'victim@example.com', to: 'victim@example.com', buttonLabel: 'See' }));
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { data: unknown }).data, { sent: true, to: 'editor@example.com' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipientEmail, 'editor@example.com', 'a recipient in the request is ignored');
  assert.equal(sent[0].recipientName, 'Edit Or');
  assert.equal(sent[0].subjectTemplate, '[Test] Hi {name}');
  assert.equal(sent[0].bodyTemplate, 'Go {home}!');
  assert.equal(sent[0].language, 'hu');
  assert.equal(sent[0].legal, 'MTK jogi rész', 'the legal part that applies to the event');
  assert.match(sent[0].shareUrl, /\/mtk$/, 'the link is the event’s short link');
  assert.equal((sent[0].facts as { home?: string }).home, 'MTK');
  assert.deepEqual([sent[0].buttonLabel, sent[0].noButton], ['See', false]);
  assert.deepEqual(roles, ['manager']);
});

test('without an event the default look and sample data are used; a draft legal part replaces the one that applies; null for the button means no button', async (t) => {
  const { sent } = setup(t);
  const { POST } = await importRoute('sample');
  await POST(post({ language: 'en', subject: 's', body: 'b', legal: 'Draft small print', buttonLabel: null }));
  assert.equal(sent[0].language, 'en');
  assert.equal(sent[0].legal, 'Draft small print');
  assert.equal(sent[0].noButton, true);
  assert.match(sent[0].shareUrl, /^https:\/\//);
});

test('an editor with no e-mail address, a bad body, an event the editor may not manage, and a server that cannot send are each refused with a plain reason, and nothing is sent', async (t) => {
  const none = setup(t, { session: NO_EMAIL });
  const { POST } = await importRoute('refused');
  assert.equal((await POST(post({ subject: 's', body: 'b' }))).status, 400);
  assert.equal(none.sent.length, 0);
});

test('a refused access sends nothing, and a send that fails or cannot be configured says so', async (t) => {
  const denied = setup(t, { allowed: false });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 's', body: 'b' }))).status, 403);
  assert.equal((await POST(post({ eventId: 'not an id', subject: 's', body: 'b' }))).status, 400);
  assert.equal((await POST(new NextRequest(url, { method: 'POST', body: 'nope' }))).status, 400);
  assert.equal(denied.sent.length, 0);
});

test('the answer says why when the e-mail is not sent: not configured is 503, a failure of the provider is 502', async (t) => {
  setup(t, { result: { sent: false, skipped: true, reason: 'missing_api_key' } });
  const { POST } = await importRoute('unconfigured');
  const response = await POST(post({ subject: 's', body: 'b' }));
  assert.equal(response.status, 503);
  assert.match(((await response.json()) as { error: string }).error, /not configured/);
});

test('a failure of the provider is a 502 with its reason', async (t) => {
  setup(t, { result: { sent: false, skipped: false, provider: 'resend', recipientEmail: 'editor@example.com', error: 'domain not verified' } });
  const { POST } = await importRoute('failed');
  const response = await POST(post({ subject: 's', body: 'b' }));
  assert.equal(response.status, 502);
  assert.match(((await response.json()) as { error: string }).error, /domain not verified/);
});
