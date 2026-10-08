import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({ events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', frames: [{ frameId: 'g1', isActive: true }, { frameId: 'g2', isActive: true }] }] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

test("removing a frame from an event marks the event's list as its own, so a partner change does not bring it back", async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete');
  const response = await DELETE(new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/frames/g1`, { method: 'DELETE' }), { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID), frameId: 'g1' }) });
  assert.equal(response.status, 200);
  assert.deepEqual((data.events[0].frames as Array<{ frameId: string }>).map((f) => f.frameId), ['g2']);
  assert.equal(data.events[0].framesOverridden, true);
});
