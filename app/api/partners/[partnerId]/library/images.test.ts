import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// The partner library route with kind=images (camera#368): the same route as frames, for the Images library.
const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const picture = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Picture ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    images: [picture('g1'), picture('g2'), picture('p1', { scope: 'partner', partnerId: 'P' }), picture('x1', { scope: 'partner', partnerId: 'OTHER' })],
    frames: [{ frameId: 'f1', name: 'Frame', isActive: true }],
    logos: [],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', defaultFrames: ['f1'] }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', frames: [{ frameId: 'f1', isActive: true }], emailFooterImageUrl: 'https://img.example/g1.png' }],
  });
  const cascades: unknown[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }),
    },
  });
  t.mock.module('@/lib/db/events', { namedExports: { updateChildEventsFromPartner: async (...args: unknown[]) => { cascades.push(args); return {}; } } });
  return { ...seeded, cascades };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const get = (query: string) => new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library${query}`);
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface Library { saved: boolean; items: Array<{ id: string; via: string }>; available: Array<{ id: string }> }
const ids = (list: Array<{ id: string }>) => list.map((i) => i.id).sort();

test("GET kind=images: the partner's own uploads, and the global images it can add with their pictures", async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(get('?kind=images'), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Library & { available: Array<{ id: string; imageUrl: string }> } };
  assert.deepEqual(ids(body.data.items), ['p1']);
  assert.deepEqual(ids(body.data.available), ['g1', 'g2']);
  assert.equal(body.data.available.find((i) => i.id === 'g1')?.imageUrl, 'https://img.example/g1.png');
});

test('PUT kind=images adds a global image; the frames the partner had are kept as its own list; no event changes', async (t) => {
  const { data, cascades } = setup(t);
  const { PUT } = await importRoute('put-add');
  const response = await PUT(put({ kind: 'images', add: ['g2'] }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { library: Library; removedInUse: Record<string, number>; cascade: unknown } };
  assert.deepEqual(ids(body.data.library.items), ['g2', 'p1']);
  assert.deepEqual(body.data.removedInUse, {});
  assert.equal(body.data.cascade, null, 'images have no defaults, so nothing cascades to the events');
  assert.deepEqual(cascades, []);
  assert.deepEqual((data.partners[0] as { library: Record<string, string[]> }).library, { frames: ['f1'], logos: [], images: ['g2'] });
  assert.equal((data.events[0] as { emailFooterImageUrl: string }).emailFooterImageUrl, 'https://img.example/g1.png');
});

test("PUT kind=images refuses another partner's upload and any default for new events", async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put-refuse');
  assert.equal((await PUT(put({ kind: 'images', add: ['x1'] }), params)).status, 400);
  const defaults = await PUT(put({ kind: 'images', defaults: ['g1'] }), params);
  assert.equal(defaults.status, 400);
  assert.match(((await defaults.json()) as { error: string }).error, /no default for new events/);
  assert.equal((data.partners[0] as { library?: unknown }).library, undefined);
});
