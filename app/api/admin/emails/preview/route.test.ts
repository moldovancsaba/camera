import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { resolveEventTheme } from '@/lib/theme/event-theme';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const PLAIN_EVENT_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    events: [
      {
        _id: EVENT_MONGO_ID,
        eventId: 'e-uuid',
        partnerId: 'P',
        name: 'MTK Budapest x Vasas FC',
        eventDate: '2026-10-16T00:00:00.000Z',
        location: 'Budapest',
        shortUrlSlug: 'mtk-vasas',
        uiLanguage: 'hu',
        frameDesign: { context: { event: { homeTeam: { name: 'MTK Budapest' }, visitorTeam: { name: 'Vasas FC' } }, partner: { name: 'MTK' } } },
      },
      { _id: PLAIN_EVENT_ID, eventId: 'plain', partnerId: 'P', name: 'Summer Festival', uiLanguage: 'en' },
    ],
    partners: [{ partnerId: 'P', name: 'MTK', emailLegal: { hu: 'MTK jogi rész: {terms}' } }],
    admin_settings: [],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/theme/load', { namedExports: { loadEventTheme: async () => resolveEventTheme({}) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _s: unknown, role: string) => {
        roles.push(role);
        return { allowed: options.allowed ?? true, role: 'admin', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}
const url = 'http://localhost/api/admin/emails/preview';
const post = (body: unknown) => new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
type Answer = { data: { subject: string; html: string; text: string; warnings: { withoutValue: string[]; unknown: string[] }; language: string } };

test('without an event the default look and sample values are used, and the legal part given is small print after the button', async (t) => {
  setup(t);
  const { POST } = await importRoute('sample');
  const { data } = (await (await POST(post({ language: 'hu', subject: 'A fotód – {event}', body: '# Szia {name}!\n\nNézd: [a fotód]({link})', legal: 'Jogi rész: {terms}' }))).json()) as Answer;
  assert.equal(data.language, 'hu');
  assert.equal(data.subject, 'A fotód – MTK Budapest x Vasas FC');
  assert.ok(data.html.includes('font-size:22px') && data.html.includes('Szia Anna!'));
  assert.ok(data.html.indexOf('font-size:12px') > data.html.indexOf('display:inline-block;padding:14px'), 'the legal part is after the button');
  assert.ok(data.text.endsWith('Jogi rész: https://seyuselfies.com/hu/policies/'));
  assert.deepEqual(data.warnings, { withoutValue: [], unknown: [] });
});

test('with an event the e-mail uses its name, teams, date and short link, and the legal part that applies to it unless one is given', async (t) => {
  const { roles } = setup(t);
  const { POST } = await importRoute('event');
  const { data } = (await (await POST(post({ eventId: String(EVENT_MONGO_ID), subject: '{teams}', body: 'Szia {name}! {home} - {visitor} ({date}, {location}) {eventlink}' }))).json()) as Answer;
  assert.equal(data.language, 'hu', 'the event’s language');
  assert.equal(data.subject, 'MTK Budapest – Vasas FC');
  assert.ok(data.text.startsWith('Szia Anna! MTK Budapest - Vasas FC (2026. október 16., Budapest) https://go.messmass.com/mtk-vasas'), data.text);
  assert.ok(data.text.includes('MTK jogi rész: https://seyuselfies.com/hu/policies/'), 'the partner’s legal part applies');
  assert.deepEqual(roles, ['viewer']);
  const own = (await (await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 's', body: 'b', legal: 'Saját jogi rész' }))).json()) as Answer;
  assert.ok(own.data.text.includes('Saját jogi rész') && !own.data.text.includes('MTK jogi rész'), 'a draft legal part replaces it');
  const none = (await (await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 's', body: 'b', legal: '' }))).json()) as Answer;
  assert.equal(none.data.text, 'b', 'an empty legal part means none');
});

test('a variable the event has no value for is left out and reported; a name that is not a variable is reported', async (t) => {
  setup(t);
  const { POST } = await importRoute('warnings');
  const { data } = (await (await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 'x', body: 'Hi {name} {partner1} {nosuch}', legal: '' }))).json()) as Answer;
  assert.equal(data.text, 'Hi Anna MTK Budapest');
  assert.deepEqual(data.warnings.unknown, ['nosuch']);
  const noTeams = (await (await POST(post({ eventId: String(PLAIN_EVENT_ID), subject: 'x', body: 'Go {home}! {teams} on {date}', legal: '' }))).json()) as Answer;
  assert.equal(noTeams.data.text, 'Go !  on', 'the variable is left out; the words around it stay as typed');
  assert.deepEqual(noTeams.data.warnings.withoutValue.sort(), ['date', 'home', 'teams']);
  const sample = (await (await POST(post({ subject: 'x', body: '{teams} {visitor}' }))).json()) as Answer;
  assert.deepEqual(sample.data.warnings, { withoutValue: [], unknown: [] }, 'sample values fill every variable');
});

test('a bad body is refused; without access to the event nothing is read; nothing is written', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { POST } = await importRoute('refused');
  assert.equal((await POST(new NextRequest(url, { method: 'POST', body: 'nope' }))).status, 400);
  assert.equal((await POST(post({ eventId: 'not an id', subject: 's', body: 'b' }))).status, 400);
  assert.equal((await POST(post({ eventId: String(EVENT_MONGO_ID), subject: 's', body: 'b' }))).status, 403);
  assert.equal(JSON.stringify(data.events).includes('emailLegal'), false);
  assert.equal(data.admin_settings.length, 0);
});
