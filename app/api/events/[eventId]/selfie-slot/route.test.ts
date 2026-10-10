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
const selfie = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Selfie ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['sample-selfie'], createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    images: [selfie('g1', { scope: 'global' }), selfie('p1', { scope: 'partner', partnerId: 'P' }), selfie('e1', { scope: 'event', eventId: 'E', partnerId: 'P' }), selfie('e2', { scope: 'event', eventId: 'OTHER', partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P' }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'E', partnerId: 'P', name: 'Match', slots: {} }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _session: unknown, minRole: string) => {
        roles.push(minRole);
        return { allowed: options.allowed !== false };
      },
    },
  });
  return { ...seeded, roles };
}

const id = String(EVENT_MONGO_ID);
const params = { params: Promise.resolve({ eventId: id }) };
const url = `http://localhost/api/events/${id}/selfie-slot`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface Panel { mode: string; effective: Array<{ id: string }>; defaultItems: Array<{ id: string }>; candidates: Array<{ id: string }>; parentName: string }

test('GET: an event that chose nothing uses what its partner uses (the global ones here), and can pick the partner’s, its own, never another event’s', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: Panel };
  assert.equal(body.data.mode, 'default');
  assert.deepEqual(body.data.effective.map((i) => i.id), ['g1']);
  assert.deepEqual(body.data.candidates.map((i) => i.id).sort(), ['e1', 'g1', 'p1']);
  assert.equal(body.data.parentName, 'the partner');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT: the event adds its own; the answer is the new panel; another event’s upload is refused; using the default clears it', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const response = await PUT(put({ value: { items: ['e1'] } }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Panel };
  assert.equal(body.data.mode, 'add');
  assert.deepEqual(body.data.effective.map((i) => i.id), ['e1', 'g1']);
  assert.deepEqual((data.events[0].slots as Record<string, unknown>).selfie, { items: ['e1'] });
  assert.equal((await PUT(put({ value: { items: ['e2'] } }), params)).status, 400);
  assert.equal((await PUT(new NextRequest(url, { method: 'PUT', body: 'not json' }), params)).status, 400, 'a body that is not JSON is refused');
  assert.equal((await PUT(put({ value: {} }), params)).status, 200);
  assert.equal((data.events[0].slots as Record<string, unknown>).selfie, undefined);
  assert.ok(roles.includes('manager'));
});

test('a user without the right is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ value: {} }), params)).status, 403);
});
