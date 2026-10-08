import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    frames: [frame('g1'), frame('g2'), frame('p1', { scope: 'partner', partnerId: 'P' }), frame('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: ['g1'], logos: [] } }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [{ frameId: 'e1', isActive: true, addedAt: 'x', addedBy: 'u' }] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: options.allowed !== false, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const params = (eventId: string = String(EVENT_MONGO_ID)) => ({ params: Promise.resolve({ eventId }) });
const get = (query: string) => new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library${query}`);

interface Body { data: { partner: { name: string } | null; assigned: Array<{ id: string; scope: string; stillInPartnerLibrary: boolean }>; available: Array<{ id: string }>; missing: unknown[] } }
const ids = (list: Array<{ id: string }>) => list.map((i) => i.id).sort();

test("GET lists what the event assigned and what it can still take: its partner's library and its own uploads, never the whole global library", async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(get('?kind=frames'), params());
  assert.equal(response.status, 200);
  const body = (await response.json()) as Body;
  assert.equal(body.data.partner?.name, 'Partner P');
  assert.deepEqual(ids(body.data.assigned), ['e1']);
  assert.equal(body.data.assigned[0].scope, 'event');
  // g1 is in the partner library, p1 is the partner's upload; g2 is global but the partner does not have it.
  assert.deepEqual(ids(body.data.available), ['g1', 'p1']);
});

test('GET needs a valid event id and a kind, and the event must exist', async (t) => {
  setup(t);
  const { GET } = await importRoute('get-bad');
  assert.equal((await GET(get('?kind=frames'), params('not-an-id'))).status, 400);
  assert.equal((await GET(get('?kind=nope'), params())).status, 400);
  assert.equal((await GET(get('?kind=frames'), params(String(new ObjectId())))).status, 404);
});

test('GET without partner access to the event is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET } = await importRoute('get-denied');
  assert.equal((await GET(get('?kind=frames'), params())).status, 403);
});
