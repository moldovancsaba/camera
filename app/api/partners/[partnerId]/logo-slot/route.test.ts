import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const NOW = '2026-10-09T10:00:00.000Z';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, thumbnailUrl: null, isActive: true, createdAt: NOW, ...extra });

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    logos: [logo('g1'), logo('g2'), logo('p1', { scope: 'partner', partnerId: 'P', source: 'messmass' }), logo('x1', { scope: 'partner', partnerId: 'OTHER' })],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', library: { frames: [], logos: ['g1'] } }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', logos: [] }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db, _session: unknown, _id: string, minRole: string) => {
        roles.push(minRole);
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level access is required');
        return { partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/logo-slot`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface Panel { value: { items?: string[] }; onModel: boolean; ownItems: Array<{ id: string }>; candidates: Array<{ id: string }> }

test('GET: the partner\'s logo choice and the logos it can pick', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: Panel };
  assert.equal(body.data.onModel, false);
  assert.deepEqual(body.data.value, {});
  assert.deepEqual(body.data.candidates.map((c) => c.id).sort(), ['g1', 'g2', 'p1'], 'its library and the global logos it can still take, never another partner\'s upload');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT: the partner chooses its logos; a global logo goes into its library at once; the answer is the new panel; no event is touched', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const response = await PUT(put({ value: { items: ['p1', 'g2'], useDefault: false } }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Panel };
  assert.equal(body.data.onModel, true);
  assert.deepEqual(body.data.value, { items: ['p1', 'g2'] }, 'a partner has no default above it: only the items are kept');
  assert.deepEqual(body.data.ownItems.map((i) => i.id), ['p1', 'g2']);
  assert.ok((data.partners[0] as { library: { logos: string[] } }).library.logos.includes('g2'));
  assert.deepEqual(data.events[0], { eventId: 'e-uuid', partnerId: 'P', logos: [] }, 'nothing is copied into the events');
  assert.deepEqual(roles, ['manager']);
});

test('PUT refuses another partner\'s logo and a body that is not a slot value; nothing is stored', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('refuse');
  assert.equal((await PUT(put({ value: { items: ['x1'] } }), params)).status, 400);
  assert.equal((await PUT(put({ value: { items: 'g1' } }), params)).status, 400);
  assert.equal((data.partners[0] as { slots?: unknown }).slots, undefined);
});

test('without manager access to the partner nothing is stored', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { PUT } = await importRoute('denied');
  assert.equal((await PUT(put({ value: { items: ['g1'] } }), params)).status, 403);
  assert.equal((data.partners[0] as { slots?: unknown }).slots, undefined);
});
