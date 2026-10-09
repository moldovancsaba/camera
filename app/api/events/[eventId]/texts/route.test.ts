import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu', texts: { hu: { 'welcome.title': 'Meccsnap' } } }],
    partners: [{ partnerId: 'P', name: 'MTK', texts: { hu: { 'welcome.button': 'Indulás' } } }],
    admin_settings: [{ settingId: 'dictionary', texts: { hu: { 'welcome.screenAlt': 'Kijelző' } } }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
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
const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const url = `http://localhost/api/events/${EVENT_MONGO_ID}/texts`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET gives the event\'s language, its own wordings and what it takes from the partner and from the global level', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: { language: string; texts: unknown; inherited: { global: unknown; partner: unknown } } };
  assert.equal(body.data.language, 'hu');
  assert.deepEqual(body.data.texts, { hu: { 'welcome.title': 'Meccsnap' } });
  assert.deepEqual(body.data.inherited.partner, { hu: { 'welcome.button': 'Indulás' } });
  assert.deepEqual(body.data.inherited.global, { hu: { 'welcome.screenAlt': 'Kijelző' } });
  assert.deepEqual(roles, ['viewer']);
});

test('PUT replaces the event\'s wordings (manager) and refuses what the rules refuse, changing nothing', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  assert.equal((await PUT(put({ texts: { hu: { 'welcome.title': 'Új cím' } } }), params)).status, 200);
  assert.deepEqual((data.events[0] as { texts: unknown }).texts, { hu: { 'welcome.title': 'Új cím' } });
  assert.deepEqual(roles, ['manager']);
  assert.equal((await PUT(put({ texts: { hu: { 'welcome.title': 'a < b' } } }), params)).status, 400);
  assert.deepEqual((data.events[0] as { texts: unknown }).texts, { hu: { 'welcome.title': 'Új cím' } });
});

test('without access nothing is read or written', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ texts: {} }), params)).status, 403);
  assert.deepEqual((data.events[0] as { texts: unknown }).texts, { hu: { 'welcome.title': 'Meccsnap' } });
});
