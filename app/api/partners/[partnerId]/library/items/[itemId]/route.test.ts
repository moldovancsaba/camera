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

function setup(t: TestContext) {
  const seeded = fakeDb({
    frames: [
      { frameId: 'p1', name: 'Own', isActive: true, scope: 'partner', partnerId: 'P' },
      { frameId: 'x1', name: 'Other partner', isActive: true, scope: 'partner', partnerId: 'OTHER' },
      { frameId: 'g1', name: 'Global', isActive: true },
    ],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', defaultFrames: ['p1'] }],
    events: [],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: { assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }) },
  });
  return seeded;
}

const ctx = (itemId: string) => ({ params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID), itemId }) });
const patch = (itemId: string, body: unknown) => [new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/items/${itemId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(itemId)] as const;
const del = (itemId: string) => [new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/items/${itemId}?kind=frames`, { method: 'DELETE' }), ctx(itemId)] as const;
const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 } };

test("a partner's own frame can be renamed and given a message area; another partner's frame and a global frame cannot be changed", async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('patch');
  assert.equal((await PATCH(...patch('p1', { kind: 'frames', name: 'Blue', messageArea: AREA }))).status, 200);
  const doc = data.frames.find((f) => f.frameId === 'p1') as { name: string; messageArea: unknown };
  assert.equal(doc.name, 'Blue');
  assert.deepEqual(doc.messageArea, AREA);
  assert.equal((await PATCH(...patch('x1', { kind: 'frames', name: 'Nope' }))).status, 400);
  assert.equal((await PATCH(...patch('g1', { kind: 'frames', name: 'Nope' }))).status, 400);
  assert.equal((await PATCH(...patch('p1', { kind: 'frames' }))).status, 400);
  assert.equal((await PATCH(...patch('p1', { kind: 'frames', messageArea: { messageBox: { x: -1, y: 0, width: 10, height: 10 } } }))).status, 400);
});

test("a partner's own frame is deleted and leaves the defaults; a frame that is not its own is refused", async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete');
  assert.equal((await DELETE(...del('x1'))).status, 400);
  assert.equal((await DELETE(...del('p1'))).status, 200);
  assert.deepEqual(data.frames.map((f) => f.frameId).sort(), ['g1', 'x1']);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, []);
});
