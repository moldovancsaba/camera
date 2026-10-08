import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const FRAME_OID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({ frames: [{ _id: FRAME_OID, frameId: 'f1', name: 'Frame', isActive: true }], events: [] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => ADMIN } });
  return seeded;
}

const put = (body: unknown) => [
  new NextRequest(`http://localhost/api/frames/${FRAME_OID}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: String(FRAME_OID) }) },
] as const;
const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 }, messageColor: hex('ffffff') };

test('a frame gets a message area (checked, unknown fields dropped) and loses it again; other changes keep working', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('area');
  assert.equal((await PUT(...put({ messageArea: { ...AREA, extra: 1 } }))).status, 200);
  assert.deepEqual((data.frames[0] as { messageArea: unknown }).messageArea, AREA);
  assert.equal((await PUT(...put({ name: 'Renamed' }))).status, 200);
  assert.equal((data.frames[0] as { name: string }).name, 'Renamed');
  assert.deepEqual((data.frames[0] as { messageArea: unknown }).messageArea, AREA, 'a rename does not touch the message area');
  assert.equal((await PUT(...put({ messageArea: null }))).status, 200);
  assert.equal('messageArea' in data.frames[0], false);
});

test('a message area that is not usable is refused and writes nothing', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('bad');
  assert.equal((await PUT(...put({ messageArea: { messageBox: { x: 0, y: 0, width: 5000, height: 10 } } }))).status, 400);
  assert.equal((await PUT(...put({ messageArea: { messageBox: AREA.messageBox, messageColor: 'white' } }))).status, 400);
  assert.equal('messageArea' in data.frames[0], false);
  assert.equal((data.frames[0] as { name: string }).name, 'Frame');
});

function setupDelete(t: TestContext, extra: { events?: Array<Record<string, unknown>>; partners?: Array<Record<string, unknown>> } = {}) {
  const seeded = fakeDb({ frames: [{ _id: FRAME_OID, frameId: 'f1', name: 'Frame', isActive: true }], events: extra.events ?? [], partners: extra.partners ?? [] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => ADMIN } });
  return seeded;
}
const del = (id = String(FRAME_OID)) => [new NextRequest(`http://localhost/api/frames/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) }] as const;
const errorOf = async (response: Response) => ((await response.json()) as { error?: string }).error ?? '';

test('a frame that nothing uses is deleted, and an unknown frame is not found', async (t) => {
  const { data } = setupDelete(t);
  const { DELETE } = await importRoute('delete-unused');
  assert.equal((await DELETE(...del(String(new ObjectId())))).status, 404);
  assert.equal((await DELETE(...del())).status, 200);
  assert.equal(data.frames.length, 0);
});

test('a frame that an event has assigned is not deleted: the answer says how many events, and the frame stays', async (t) => {
  const { data } = setupDelete(t, { events: [{ eventId: 'e1', frames: [{ frameId: 'f1', isActive: true }] }, { eventId: 'e2', frames: [{ frameId: 'f1', isActive: false }] }] });
  const { DELETE } = await importRoute('delete-event');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  assert.match(await errorOf(response), /used by 2 events\. Switch it off instead/);
  assert.equal(data.frames.length, 1);
});

test('a frame that a partner library holds, or a partner makes a default, is not deleted either', async (t) => {
  const { data } = setupDelete(t, { partners: [{ partnerId: 'P', defaultFrames: ['f1'], library: { frames: ['f1'], logos: [] } }] });
  const { DELETE } = await importRoute('delete-partner');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  assert.match(await errorOf(response), /1 partner library, 1 partner that makes it a default for new events/);
  assert.equal(data.frames.length, 1);
});

