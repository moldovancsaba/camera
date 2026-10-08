import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// Deleting a partner's own image upload (camera#368).
const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    images: [
      { pictureId: 'p1', name: 'Own', imageUrl: 'https://img.example/p1.png', isActive: true, scope: 'partner', partnerId: 'P' },
      { pictureId: 'g1', name: 'Global', imageUrl: 'https://img.example/g1.png', isActive: true },
    ],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P' }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', emailFooterImageUrl: 'https://img.example/p1.png' }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: { assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }) },
  });
  return seeded;
}

const del = (itemId: string) =>
  [new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/items/${itemId}?kind=images`, { method: 'DELETE' }), { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID), itemId }) }] as const;

test("a partner's own image is deleted even while an event field shows it: that field keeps its address", async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('own');
  assert.equal((await DELETE(...del('p1'))).status, 200);
  assert.deepEqual(data.images.map((i) => i.pictureId), ['g1']);
  assert.equal((data.events[0] as { emailFooterImageUrl: string }).emailFooterImageUrl, 'https://img.example/p1.png');
});

test('a global image is not deleted here, and an unknown image is "Image not found"', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('refused');
  assert.equal((await DELETE(...del('g1'))).status, 400);
  const unknown = await DELETE(...del('nope'));
  assert.equal(unknown.status, 404);
  assert.equal(((await unknown.json()) as { error: string }).error, 'Image not found');
  assert.equal(data.images.length, 2);
});
