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
  const seeded = fakeDb({ partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'MTK Budapest', pictures: { welcomeBackground: 'https://img.example/bg.png', old: 'https://img.example/old.png' } }] });
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
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/pictures`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET gives the partner\'s pictures: only the known ones with an https address', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: { name: string; pictures: unknown } };
  assert.equal(body.data.name, 'MTK Budapest');
  assert.deepEqual(body.data.pictures, { welcomeBackground: 'https://img.example/bg.png' });
  assert.deepEqual(roles, ['viewer']);
});

test('PUT replaces the pictures (manager); an empty address takes one away; a bad one is refused and nothing changes', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  assert.equal((await PUT(put({ pictures: { welcomeScreen: 'https://img.example/screen.png' } }), params)).status, 200);
  assert.deepEqual((data.partners[0] as { pictures: unknown }).pictures, { welcomeScreen: 'https://img.example/screen.png' }, 'replaced, not merged');
  assert.deepEqual(roles, ['manager']);
  assert.equal((await PUT(put({ pictures: { welcomeScreen: '' } }), params)).status, 200);
  assert.deepEqual((data.partners[0] as { pictures: unknown }).pictures, {});
  assert.equal((await PUT(put({ pictures: { welcomeScreen: 'http://insecure.example/x.png' } }), params)).status, 400);
  assert.equal((await PUT(put({ pictures: { nope: 'https://img.example/x.png' } }), params)).status, 400);
  assert.deepEqual((data.partners[0] as { pictures: unknown }).pictures, {});
});

test('without access nothing is read or written', async (t) => {
  const { data } = setup(t, { denied: true });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ pictures: {} }), params)).status, 403);
  assert.ok((data.partners[0] as { pictures: Record<string, string> }).pictures.welcomeBackground);
});
