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
const selfie = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Selfie ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['sample-selfie'], createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    images: [selfie('g1', { scope: 'global' }), selfie('g2', { scope: 'global' }), selfie('p1', { scope: 'partner', partnerId: 'P' }), selfie('x1', { scope: 'partner', partnerId: 'OTHER' })],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P' }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    exports: {
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
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/selfie-slot`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface Panel { value: { items?: string[]; useDefault?: boolean }; mode: string; effective: Array<{ id: string; level?: string }>; candidates: Array<{ id: string }>; parentName: string }

test('GET: a partner that chose nothing follows the global sample selfies, and can pick the global ones and its own uploads, never another partner’s', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: Panel };
  assert.equal(body.data.mode, 'default');
  assert.deepEqual(body.data.effective.map((i) => i.id).sort(), ['g1', 'g2']);
  assert.deepEqual(body.data.candidates.map((i) => i.id).sort(), ['g1', 'g2', 'p1']);
  assert.equal(body.data.parentName, 'the global library');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT: the partner replaces the global set with its own; the answer is the new panel; a refused pick writes nothing; using the default clears it', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const response = await PUT(put({ value: { items: ['p1', 'g2'], useDefault: false } }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Panel };
  assert.equal(body.data.mode, 'replace');
  assert.deepEqual(body.data.effective.map((i) => i.id), ['p1', 'g2']);
  assert.deepEqual((data.partners[0].slots as Record<string, unknown>).selfie, { items: ['p1', 'g2'], useDefault: false });
  assert.equal((await PUT(put({ value: { items: ['x1'] } }), params)).status, 400, 'another partner’s upload');
  assert.equal((await PUT(put({ value: { items: ['nope'] } }), params)).status, 404);
  assert.equal((await PUT(put({ value: 5 }), params)).status, 400);
  assert.deepEqual((data.partners[0].slots as Record<string, unknown>).selfie, { items: ['p1', 'g2'], useDefault: false });
  assert.equal((await PUT(put({ value: {} }), params)).status, 200);
  assert.equal((data.partners[0].slots as Record<string, unknown> | undefined)?.selfie, undefined);
  assert.ok(roles.every((role) => role === 'manager'));
});

test('a user without the right is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ value: {} }), params)).status, 403);
});

// The partner's sample selfies are what its events' welcome page screens show until they choose their own (issue 540): a saved choice asks for the pictures of its events to be drawn again (after the
// response, those that have the picture; each decides by its stored pick whether anything changes). A refused choice and a read ask for nothing.
test('PUT: a saved choice schedules the redraw of the welcome page screens of the partner\'s events; a refused one and a read do not', async (t) => {
  const scheduled: Array<{ partnerId: unknown; reason: unknown }> = [];
  const redrawReal = await import('@/lib/screen/welcome-redraw');
  t.mock.module('@/lib/screen/welcome-redraw', { namedExports: { ...redrawReal, scheduleWelcomeRedrawForPartner: (partnerId: unknown, reason: unknown) => scheduled.push({ partnerId, reason }) } });
  setup(t);
  const { GET, PUT } = await importRoute('redraw');
  await GET(new NextRequest(url), params);
  assert.equal((await PUT(put({ value: { items: ['x1'] } }), params)).status, 400);
  assert.equal(scheduled.length, 0);
  assert.equal((await PUT(put({ value: { items: ['p1'], useDefault: false } }), params)).status, 200);
  assert.deepEqual(scheduled, [{ partnerId: 'P', reason: 'partner-sample-selfie' }]);
});
