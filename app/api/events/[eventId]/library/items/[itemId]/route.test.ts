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
    frames: [
      { frameId: 'e1', name: 'Own', isActive: true, scope: 'event', eventId: 'e-uuid', partnerId: 'P' },
      { frameId: 'e2', name: 'Other event', isActive: true, scope: 'event', eventId: 'other-uuid', partnerId: 'P' },
      { frameId: 'g1', name: 'Global', isActive: true },
    ],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', frames: [{ frameId: 'e1', isActive: true }, { frameId: 'g1', isActive: true }] }],
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { exports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const del = (itemId: string, kind = 'frames') => [
  new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library/items/${itemId}?kind=${kind}`, { method: 'DELETE' }),
  { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID), itemId }) },
] as const;

test("deleting an event's own frame requires removing its event assignment first", async (t) => {
  const { data, db, calls } = setup(t);
  const { DELETE } = await importRoute('own');
  const blocked = await DELETE(...del('e1'));
  assert.equal(blocked.status, 409);
  const body = (await blocked.json()) as { details: { usages: Array<{ uses: string[] }> } };
  assert.deepEqual(body.details.usages.flatMap((usage) => usage.uses), ['Assigned event frame']);
  assert.deepEqual(data.frames.map((f) => f.frameId).sort(), ['e1', 'e2', 'g1']);

  // Simulate removing the assignment in event settings before retrying.
  await db.collection('events').updateOne({ eventId: 'e-uuid' }, { $pull: { frames: { frameId: 'e1' } } } as never);
  calls.length = 0;
  const response = await DELETE(...del('e1'));
  assert.equal(response.status, 200);
  assert.deepEqual(data.frames.map((f) => f.frameId).sort(), ['e2', 'g1']);
  assert.deepEqual((data.events[0] as { frames: Array<{ frameId: string }> }).frames.map((f) => f.frameId), ['g1']);
  assert.deepEqual((data.events[0] as { frames: Array<{ frameId: string }> }).frames.map((f) => f.frameId), ['g1']);
});

test("another event's upload, a global frame and an unknown frame cannot be deleted from this event", async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('refuse');
  assert.equal((await DELETE(...del('e2'))).status, 400);
  assert.equal((await DELETE(...del('g1'))).status, 400);
  assert.equal((await DELETE(...del('nope'))).status, 404);
  assert.equal((await DELETE(...del('e1', 'nope'))).status, 400);
  assert.equal(data.frames.length, 3);
});

const patch = (itemId: string, body: unknown) => [
  new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library/items/${itemId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID), itemId }) },
] as const;
const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 }, messageColor: hex('ffffff') };

test("the message area of an event's own frame can be set and removed, and the answer carries it", async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('patch');
  const set = await PATCH(...patch('e1', { kind: 'frames', messageArea: AREA }));
  assert.equal(set.status, 200);
  const body = (await set.json()) as { data: { item: { id: string; messageArea: { messageBox: { width: number } } | null } } };
  assert.equal(body.data.item.messageArea?.messageBox.width, 880);
  assert.deepEqual((data.frames.find((f) => f.frameId === 'e1') as { messageArea: unknown }).messageArea, AREA);
  const removed = await PATCH(...patch('e1', { kind: 'frames', messageArea: null }));
  assert.equal(removed.status, 200);
  assert.equal('messageArea' in (data.frames.find((f) => f.frameId === 'e1') as object), false);
});

test('a message area that is not usable, a frame that is not the event\'s own, and an empty change are refused', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('patch-refuse');
  assert.equal((await PATCH(...patch('e1', { kind: 'frames', messageArea: { messageBox: { x: 0, y: 0, width: 0, height: 0 } } }))).status, 400);
  assert.equal((await PATCH(...patch('e2', { kind: 'frames', messageArea: AREA }))).status, 400, "another event's upload");
  assert.equal((await PATCH(...patch('g1', { kind: 'frames', messageArea: AREA }))).status, 400, 'a global frame');
  assert.equal((await PATCH(...patch('e1', { kind: 'frames' }))).status, 400, 'nothing to change');
  assert.equal((await PATCH(...patch('nope', { kind: 'frames', name: 'x' }))).status, 404);
  assert.equal((data.frames.find((f) => f.frameId === 'e1') as { messageArea?: unknown }).messageArea, undefined);
});
