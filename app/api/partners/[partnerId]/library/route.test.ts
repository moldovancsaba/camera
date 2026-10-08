import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    frames: [frame('g1'), frame('g2'), frame('p1', { scope: 'partner', partnerId: 'P' }), frame('x1', { scope: 'partner', partnerId: 'OTHER' })],
    logos: [],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', defaultFrames: ['g1'] }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', frames: [{ frameId: 'g2', isActive: true }] }],
  });
  const cascades: Array<{ partnerId: string; updates: unknown }> = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', {
    namedExports: { ...apiReal, requireAuth: async () => ADMIN },
  });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => {
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level manager access is required');
        const partner = await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID });
        return { partner, role: 'admin', partnerId: 'P' };
      },
    },
  });
  t.mock.module('@/lib/db/events', {
    namedExports: {
      updateChildEventsFromPartner: async (partnerId: string, updates: unknown) => {
        cascades.push({ partnerId, updates });
        return { brandColorsUpdated: 0, framesUpdated: 1, logosUpdated: 0 };
      },
    },
  });
  return { ...seeded, cascades };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const get = (query: string) => new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library${query}`);
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

interface LibraryBody { data: { library: { saved: boolean; items: Array<{ id: string; via: string; isDefault: boolean }>; available: Array<{ id: string }> }; removedInUse: Record<string, number>; cascade: unknown } }
const ids = (list: Array<{ id: string }>) => list.map((i) => i.id).sort();

test('GET returns the partner library with pictures, what it can still add, and says whether it is saved', async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(get('?kind=frames'), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: LibraryBody['data']['library'] };
  assert.equal(body.data.saved, false, 'the partner has not saved a library: it keeps what it had');
  assert.deepEqual(ids(body.data.items), ['g1', 'g2', 'p1']);
  assert.deepEqual(ids(body.data.available), []);
});

test('GET refuses a kind that does not exist', async (t) => {
  setup(t);
  const { GET } = await importRoute('get-bad-kind');
  assert.equal((await GET(get('?kind=images'), params)).status, 400);
  assert.equal((await GET(get(''), params)).status, 400);
});

test('PUT removes a frame, saves the library, and says how many events keep using it', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put-remove');
  const response = await PUT(put({ kind: 'frames', remove: ['g2'] }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as LibraryBody;
  assert.deepEqual(body.data.removedInUse, { g2: 1 });
  assert.equal(body.data.library.saved, true);
  assert.deepEqual(ids(body.data.library.items), ['g1', 'p1']);
  assert.deepEqual(ids(body.data.library.available), ['g2'], 'removed, so it can be added again');
  const saved = data.partners[0] as { library: { frames: string[] } };
  assert.deepEqual(saved.library.frames.sort(), ['g1']);
  assert.equal(data.events[0].frames && (data.events[0].frames as unknown[]).length, 1, 'the event keeps its frame');
});

test('PUT with defaults saves them and cascades to the events that have not edited their own list', async (t) => {
  const { data, cascades } = setup(t);
  const { PUT } = await importRoute('put-defaults');
  const response = await PUT(put({ kind: 'frames', defaults: ['g1', 'p1'] }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, ['g1', 'p1']);
  assert.deepEqual(cascades, [{ partnerId: 'P', updates: { defaultFrames: ['g1', 'p1'] } }]);
});

test('PUT that changes no default does not touch the events', async (t) => {
  const { cascades } = setup(t);
  const { PUT } = await importRoute('put-add-only');
  const response = await PUT(put({ kind: 'frames', add: [] , remove: ['g2'] }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(cascades, []);
});

test('PUT refuses an item that is not in the global library, and a default outside the library', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put-refuse');
  const upload = await PUT(put({ kind: 'frames', add: ['x1'] }), params);
  assert.equal(upload.status, 400, "another partner's upload cannot be added");
  const outside = await PUT(put({ kind: 'frames', defaults: ['x1'] }), params);
  assert.equal(outside.status, 400);
  assert.equal((data.partners[0] as { library?: unknown }).library, undefined, 'a refused edit writes nothing');
});

test('PUT needs a kind and something to change, and ids as a list', async (t) => {
  setup(t);
  const { PUT } = await importRoute('put-validate');
  assert.equal((await PUT(put({}), params)).status, 400);
  assert.equal((await PUT(put({ kind: 'frames' }), params)).status, 400, 'nothing to change');
  assert.equal((await PUT(put({ kind: 'frames', add: 'g1' }), params)).status, 400);
  assert.equal((await PUT(put({ kind: 'frames', add: [7] }), params)).status, 400);
});

test('a user without manager access to the partner cannot change its library', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { PUT } = await importRoute('put-forbidden');
  const response = await PUT(put({ kind: 'frames', remove: ['g1'] }), params);
  assert.equal(response.status, 403);
  assert.equal((data.partners[0] as { library?: unknown }).library, undefined);
});
