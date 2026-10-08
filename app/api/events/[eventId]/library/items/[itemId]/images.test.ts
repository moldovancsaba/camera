import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// Deleting an event's own image upload (camera#368): the event document is left as it is (an image is not assigned).
const apiReal = await import('@/lib/api');

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    images: [
      { pictureId: 'e1', name: 'Own', imageUrl: 'https://img.example/e1.png', isActive: true, scope: 'event', eventId: 'e-uuid', partnerId: 'P' },
      { pictureId: 'g1', name: 'Global', imageUrl: 'https://img.example/g1.png', isActive: true },
    ],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', emailFooterImageUrl: 'https://img.example/e1.png' }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const del = (itemId: string) =>
  [new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library/items/${itemId}?kind=images`, { method: 'DELETE' }), { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID), itemId }) }] as const;

test("deleting an event's own image removes it from the library; the event and its picture fields stay as they are", async (t) => {
  const { data, calls } = setup(t);
  const { DELETE } = await importRoute('own');
  assert.equal((await DELETE(...del('e1'))).status, 200);
  assert.deepEqual(data.images.map((i) => i.pictureId), ['g1']);
  assert.deepEqual(data.events[0], { _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', emailFooterImageUrl: 'https://img.example/e1.png' });
  assert.equal(calls.some((c) => c.collection === 'events'), false);
});

test('a global image is not deleted from an event, and an unknown one is "Image not found"', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('refused');
  assert.equal((await DELETE(...del('g1'))).status, 400);
  const unknown = await DELETE(...del('nope'));
  assert.equal(unknown.status, 404);
  assert.equal(((await unknown.json()) as { error: string }).error, 'Image not found');
  assert.equal(data.images.length, 2);
});
