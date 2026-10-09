import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { denied?: boolean } = {}) {
  const seeded = fakeDb({
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'MTK Budapest', texts: { hu: { 'welcome.button': 'Indulás' } } }],
    admin_settings: [{ settingId: 'dictionary', texts: { hu: { 'welcome.title': 'Üdv' } } }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: { collection: (n: string) => { findOne: (f: unknown) => Promise<Record<string, unknown> | null> } }, _s: unknown, id: string, role: string) => {
        roles.push(role);
        if (options.denied) throw apiReal.apiError('Forbidden', 403);
        return { partner: await db.collection('partners').findOne({ _id: new ObjectId(id) }), role: 'viewer', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}
const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/texts`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET gives the partner\'s own wordings and what it takes from above', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: { name: string; texts: unknown; inherited: { global: unknown } } };
  assert.equal(body.data.name, 'MTK Budapest');
  assert.deepEqual(body.data.texts, { hu: { 'welcome.button': 'Indulás' } });
  assert.deepEqual(body.data.inherited.global, { hu: { 'welcome.title': 'Üdv' } });
  assert.deepEqual(roles, ['viewer']);
});

test('PUT replaces the partner\'s wordings (manager), checked by the same rules', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const ok = await PUT(put({ texts: { en: { 'welcome.button': 'Kick off' } } }), params);
  assert.equal(ok.status, 200);
  assert.deepEqual((data.partners[0] as { texts: unknown }).texts, { en: { 'welcome.button': 'Kick off' } }, 'replaced, not merged');
  assert.deepEqual(roles, ['manager']);
  assert.equal((await PUT(put({ texts: { en: { 'welcome.button': '<i>x</i>' } } }), params)).status, 400);
  assert.deepEqual((data.partners[0] as { texts: unknown }).texts, { en: { 'welcome.button': 'Kick off' } }, 'a refused save changes nothing');
});

test('without access nothing is read or written', async (t) => {
  const { data } = setup(t, { denied: true });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ texts: {} }), params)).status, 403);
  assert.deepEqual((data.partners[0] as { texts: unknown }).texts, { hu: { 'welcome.button': 'Indulás' } });
});
