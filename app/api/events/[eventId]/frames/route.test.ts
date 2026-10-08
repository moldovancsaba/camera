import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    frames: [frame('g1'), frame('g2'), frame('g3', { isActive: false }), frame('p1', { scope: 'partner', partnerId: 'P' }), frame('e1', { scope: 'event', eventId: 'e-uuid' }), frame('e2', { scope: 'event', eventId: 'other-uuid' })],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: ['g1'], logos: [] } }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const post = (frameId: string) =>
  new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/frames`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frameId, isActive: true }) });
const assigned = (data: Record<string, Array<Record<string, unknown>>>) => (data.events[0].frames as Array<{ frameId: string }>).map((f) => f.frameId);

test("an event takes a frame from its partner's library, and the event now has its own list", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('library');
  assert.equal((await POST(post('g1'), params)).status, 200);
  assert.deepEqual(assigned(data), ['g1']);
  assert.equal(data.events[0].framesOverridden, true);
});

test("an event takes its partner's own upload and its own upload", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('own');
  assert.equal((await POST(post('p1'), params)).status, 200);
  assert.equal((await POST(post('e1'), params)).status, 200);
  assert.deepEqual(assigned(data), ['p1', 'e1']);
});

test('an event cannot take a frame straight from the global library, another event\'s upload, or a switched off frame', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('refuse');
  const global = await POST(post('g2'), params);
  assert.equal(global.status, 400);
  assert.match(((await global.json()) as { error: string }).error, /partner library/i);
  assert.equal((await POST(post('e2'), params)).status, 400);
  assert.equal((await POST(post('g3'), params)).status, 400);
  assert.equal((await POST(post('nope'), params)).status, 404);
  assert.deepEqual(assigned(data), []);
  assert.equal(data.events[0].framesOverridden, undefined, 'a refused assignment writes nothing');
});

test('the same frame is not assigned twice', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('twice');
  assert.equal((await POST(post('g1'), params)).status, 200);
  assert.equal((await POST(post('g1'), params)).status, 400);
  assert.deepEqual(assigned(data), ['g1']);
});
