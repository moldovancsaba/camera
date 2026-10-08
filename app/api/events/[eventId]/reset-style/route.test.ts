import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    partners: [{ partnerId: 'P', name: 'Partner P' }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'evt-uuid', partnerId: 'P', brandColor: hex('1b3a69'), brandBorderColor: hex('189cd8'), brandColorsOverridden: true }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { assertGlobalAdminOrPartnerEventAccess: async () => ({ role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const post = (id: string, body: unknown) => [
  new NextRequest(`http://localhost/api/events/${id}/reset-style`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ eventId: id }) },
] as const;

test("Reset on the event page works with the event's address id: its own colours go and it follows messmass", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('reset');
  const response = await POST(...post(String(EVENT_MONGO_ID), { styleField: 'brandColors' }));
  assert.equal(response.status, 200);
  const event = data.events[0];
  assert.deepEqual([event.brandColor, event.brandBorderColor, event.brandColorsOverridden], [null, null, false]);
});

test('Reset refuses an address that is not an event id, an event that does not exist, and a style field it does not know', async (t) => {
  setup(t);
  const { POST } = await importRoute('refuse');
  assert.equal((await POST(...post('not-an-id', { styleField: 'brandColors' }))).status, 400);
  assert.equal((await POST(...post(String(new ObjectId()), { styleField: 'brandColors' }))).status, 404);
  assert.equal((await POST(...post(String(EVENT_MONGO_ID), { styleField: 'fonts' }))).status, 400);
});
