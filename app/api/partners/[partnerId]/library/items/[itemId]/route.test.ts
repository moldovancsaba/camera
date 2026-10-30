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
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    exports: { assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }) },
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

test("deleting a partner's frame requires removing its default use first", async (t) => {
  const { data, db, calls } = setup(t);
  const { DELETE } = await importRoute('delete');
  assert.equal((await DELETE(...del('x1'))).status, 400);
  const blocked = await DELETE(...del('p1'));
  assert.equal(blocked.status, 409);
  const body = (await blocked.json()) as { details: { usages: Array<{ uses: string[] }> } };
  assert.deepEqual(body.details.usages.flatMap((usage) => usage.uses), ['Default for new events']);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, ['p1']);

  // Simulate removing the default in partner settings before retrying.
  await db.collection('partners').updateOne({ partnerId: 'P' }, { $pull: { defaultFrames: 'p1' } } as never);
  calls.length = 0;
  assert.equal((await DELETE(...del('p1'))).status, 200);
  assert.deepEqual(data.frames.map((f) => f.frameId).sort(), ['g1', 'x1']);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, []);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, []);
});
