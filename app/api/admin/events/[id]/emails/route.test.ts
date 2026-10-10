import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const LEGACY_EVENT_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { denied?: boolean } = {}) {
  const seeded = fakeDb({
    events: [
      { _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu' },
      {
        _id: LEGACY_EVENT_ID,
        eventId: 'e-tryon',
        name: 'Old try-on night',
        uiLanguage: 'en',
        tryOn: { enabled: true },
        notifications: {
          submissionResultEmailEnabled: true,
          submissionResultEmailSendAfterSave: true,
          submissionResultEmailSubjectAfterSave: 'Your photo from {event}',
          submissionResultEmailBodyAfterSave: 'Hi {name}, own words {link}',
          submissionResultEmailSendAfterRelatedPhotosReady: true,
          submissionResultEmailSenderName: 'The Club',
        },
      },
    ],
    partners: [{ partnerId: 'P', name: 'MTK' }],
    admin_settings: [],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, _id: string, role: string) => {
        roles.push(role);
        if (options.denied) throw apiReal.apiError('Forbidden', 403);
      },
    },
  });
  return { ...seeded, roles };
}
const params = (id: ObjectId) => ({ params: Promise.resolve({ id: String(id) }) });
const url = (id: ObjectId) => `http://localhost/api/admin/events/${id}/emails`;
const put = (id: ObjectId, body: unknown) => new NextRequest(url(id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface View {
  language: string;
  types: Array<{ type: string; enabled: boolean; chosen: boolean | null; subject: string | null; body: string | null; defaultOn: boolean; defaultFrom: string; defaultSubject: string; defaultBody: string; sent: boolean; buttonLabel: string | null }>;
  followUp: { day: string | null; from: string | null; until: string | null };
  senderName: string | null;
  termsUrl: string | null;
  defaultTermsUrl: string;
}
const view = async (response: Response) => ((await response.json()) as { data: View }).data;
const byType = (v: View, type: string) => v.types.find((row) => row.type === type)!;

test('GET: an event that never chose has approved and declined on, the others off, and every text follows the default in the event’s language', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const data = await view(await GET(new NextRequest(url(EVENT_MONGO_ID)), params(EVENT_MONGO_ID)));
  assert.equal(data.language, 'hu');
  assert.deepEqual(data.types.map((row) => [row.type, row.enabled, row.chosen]), [['welcome', false, null], ['arrived', false, null], ['approved', true, null], ['declined', true, null], ['followUp', false, null]]);
  assert.ok(data.types.every((row) => row.subject === null && row.body === null && row.defaultSubject && row.defaultBody));
  assert.ok(byType(data, 'welcome').defaultBody.includes('{eventlink}') && byType(data, 'approved').defaultSubject.includes('{event}'));
  assert.deepEqual(data.types.map((row) => row.sent), [true, true, true, true, true], 'every type is sent by something now: the follow up by the daily job (issue 559)');
  assert.deepEqual(data.types.map((row) => row.defaultFrom), ['standard', 'standard', 'standard', 'standard', 'standard']);
  assert.deepEqual(data.followUp, { day: null, from: null, until: null }, 'an event with no date sends no follow up');
  assert.equal(byType(data, 'arrived').buttonLabel, null);
  assert.equal('tryOn' in data, false, 'there are no try-on e-mails any more');
  assert.deepEqual([data.senderName, data.termsUrl], [null, null]);
  assert.match(data.defaultTermsUrl, /hu\/policies/);
  assert.deepEqual(roles, ['viewer']);
});

test('GET: what an event stored is read: the old after-save pair is the approved e-mail, an own text is shown, the old default text is not one, and the stored fields of the old try-on e-mails show nothing', async (t) => {
  setup(t);
  const { GET } = await importRoute('legacy');
  const data = await view(await GET(new NextRequest(url(LEGACY_EVENT_ID)), params(LEGACY_EVENT_ID)));
  const approved = byType(data, 'approved');
  assert.equal(approved.subject, null, 'the old form saved the default subject as if it were its own: it is the default');
  assert.equal(approved.body, 'Hi {name}, own words {link}');
  assert.equal(data.senderName, 'The Club');
  assert.equal('tryOn' in data, false, 'an event that used try-on has no try-on e-mails either (issue 557)');
});

test('PUT replaces the types, takes the old approved fields away, keeps the rest, and answers the new view', async (t) => {
  const { data: db, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const answer = await view(
    await PUT(put(LEGACY_EVENT_ID, { types: { approved: { enabled: false }, welcome: { enabled: true, subject: 'Welcome {name}' } }, termsUrl: 'https://example.com/terms', tryOn: { related: { enabled: false } } }), params(LEGACY_EVENT_ID))
  );
  assert.deepEqual(roles, ['manager']);
  const stored = (db.events[1] as { notifications: Record<string, unknown> }).notifications;
  assert.deepEqual(stored.types, { approved: { enabled: false }, welcome: { enabled: true, subject: 'Welcome {name}' } });
  for (const gone of ['submissionResultEmailEnabled', 'submissionResultEmailSendAfterSave', 'submissionResultEmailSubjectAfterSave', 'submissionResultEmailBodyAfterSave']) assert.equal(gone in stored, false, gone);
  assert.equal(stored.submissionResultEmailSenderName, 'The Club', 'what the page did not touch stays');
  assert.equal('submissionResultEmailSendAfterRelatedPhotosReady' in stored, false, 'saving drops what the event stored for the removed related-photos e-mail');
  assert.equal(stored.termsUrl, 'https://example.com/terms');
  assert.deepEqual([byType(answer, 'approved').enabled, byType(answer, 'approved').chosen, byType(answer, 'welcome').enabled, byType(answer, 'welcome').subject], [false, false, true, 'Welcome {name}']);
  const cleared = await view(await PUT(put(LEGACY_EVENT_ID, { types: {}, senderName: null, termsUrl: null }), params(LEGACY_EVENT_ID)));
  assert.deepEqual([byType(cleared, 'approved').enabled, byType(cleared, 'welcome').enabled, cleared.senderName, cleared.termsUrl], [true, false, null, null], 'no choices left: the defaults apply');
});

test('PUT refuses what it cannot store and writes nothing: a bad body, a terms link that is not a web address, a sender that is too long', async (t) => {
  const { data: db } = setup(t);
  const { PUT } = await importRoute('refuse');
  assert.equal((await PUT(new NextRequest(url(EVENT_MONGO_ID), { method: 'PUT', body: 'nope' }), params(EVENT_MONGO_ID))).status, 400);
  assert.equal((await PUT(put(EVENT_MONGO_ID, { types: 'x' }), params(EVENT_MONGO_ID))).status, 400);
  assert.equal((await PUT(put(EVENT_MONGO_ID, { termsUrl: 'javascript:alert(1)' }), params(EVENT_MONGO_ID))).status, 400);
  assert.equal((await PUT(put(EVENT_MONGO_ID, { senderName: 'x'.repeat(200) }), params(EVENT_MONGO_ID))).status, 400);
  assert.equal('notifications' in (db.events[0] as object), false);
});

test('without access nothing is read or written', async (t) => {
  const { data: db } = setup(t, { denied: true });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url(EVENT_MONGO_ID)), params(EVENT_MONGO_ID))).status, 403);
  assert.equal((await PUT(put(EVENT_MONGO_ID, { types: { welcome: { enabled: true } } }), params(EVENT_MONGO_ID))).status, 403);
  assert.equal('notifications' in (db.events[0] as object), false);
});

test('GET: the follow up follows the partner\'s default until the event chooses, and says from when and until when it is sent', async (t) => {
  const seeded = setup(t);
  (seeded.data.events[0] as Record<string, unknown>).eventDate = '2026-10-16';
  (seeded.data.partners[0] as Record<string, unknown>).followUpEmail = true;
  const { GET } = await importRoute('partner-default');
  let data = await view(await GET(new NextRequest(url(EVENT_MONGO_ID)), params(EVENT_MONGO_ID)));
  assert.deepEqual([byType(data, 'followUp').enabled, byType(data, 'followUp').chosen, byType(data, 'followUp').defaultOn, byType(data, 'followUp').defaultFrom], [true, null, true, 'partner']);
  assert.deepEqual(data.followUp, { day: '2026-10-16', from: '2026-10-23', until: '2026-11-06' });
  assert.equal(byType(data, 'welcome').defaultFrom, 'standard', 'only the follow up has a partner default');

  (seeded.data.events[0] as Record<string, unknown>).notifications = { types: { followUp: { enabled: false } } };
  data = await view(await GET(new NextRequest(url(EVENT_MONGO_ID)), params(EVENT_MONGO_ID)));
  assert.deepEqual([byType(data, 'followUp').enabled, byType(data, 'followUp').chosen], [false, false], 'the event\'s own choice wins over its partner');
});
