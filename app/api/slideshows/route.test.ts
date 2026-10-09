import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const DEFAULT_ID = new ObjectId();
const OTHER_ID = new ObjectId();

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    slideshows: [
      { _id: DEFAULT_ID, slideshowId: 's-default', eventId: 'e-uuid', name: 'Default slideshow', isDefault: true },
      { _id: OTHER_ID, slideshowId: 's-other', eventId: 'e-uuid', name: 'Mine' },
    ],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ({ appRole: 'admin', user: { id: 'a1' } }) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => true, getPartnerScopedAccessForEvent: async () => ({ allowed: true }), getPartnerScopedAccessForEventUuid: async () => ({ allowed: true }) } });
  return seeded;
}

const del = (id: ObjectId) => new NextRequest(`http://localhost/api/slideshows?id=${id}`, { method: 'DELETE' });

test('the default slideshow of an event cannot be deleted: make another the default first', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('default');
  const response = await DELETE(del(DEFAULT_ID));
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as { error: string }).error, /Make another slideshow the default first/);
  assert.equal(data.slideshows.length, 2);
});

test('any other slideshow is deleted as before', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('other');
  assert.equal((await DELETE(del(OTHER_ID))).status, 200);
  assert.deepEqual(data.slideshows.map((s) => s.slideshowId), ['s-default']);
});
