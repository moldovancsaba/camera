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

function setup(t: TestContext, options: { denied?: boolean; followUpEmail?: unknown } = {}) {
  const seeded = fakeDb({ partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'MTK Budapest', ...(options.followUpEmail !== undefined ? { followUpEmail: options.followUpEmail } : {}) }] });
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
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/email-defaults`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const answer = async (response: Response) => ((await response.json()) as { data: { name: string; followUp: boolean | null } }).data;

test('GET gives the partner\'s stored choice for the follow-up e-mail: none until somebody chooses (viewer)', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get-none');
  assert.deepEqual(await answer(await GET(new NextRequest(url), params)), { name: 'MTK Budapest', followUp: null });
  assert.deepEqual(roles, ['viewer']);
});

test('GET gives a stored true or false as it is', async (t) => {
  setup(t, { followUpEmail: true });
  const { GET } = await importRoute('get-true');
  assert.equal((await answer(await GET(new NextRequest(url), params))).followUp, true);
});

test('PUT saves true or false (manager) and takes the choice away with null; anything else is refused and nothing changes', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  assert.deepEqual(await answer(await PUT(put({ followUp: true }), params)), { name: 'MTK Budapest', followUp: true });
  assert.equal((data.partners[0] as { followUpEmail: unknown }).followUpEmail, true);
  assert.deepEqual(roles, ['manager']);
  assert.equal((await PUT(put({ followUp: false }), params)).status, 200);
  assert.equal((data.partners[0] as { followUpEmail: unknown }).followUpEmail, false);
  assert.equal((await PUT(put({ followUp: null }), params)).status, 200);
  assert.equal('followUpEmail' in data.partners[0], false, 'no choice: the field is gone');
  assert.equal((await PUT(put({ followUp: true }), params)).status, 200);
  for (const bad of [{ followUp: 'yes' }, { followUp: 1 }, {}, { other: true }]) assert.equal((await PUT(put(bad), params)).status, 400, JSON.stringify(bad));
  assert.equal((data.partners[0] as { followUpEmail: unknown }).followUpEmail, true, 'a refused request changed nothing');
});

test('without access nothing is read or written', async (t) => {
  const { data } = setup(t, { denied: true });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ followUp: true }), params)).status, 403);
  assert.equal('followUpEmail' in data.partners[0], false);
});
