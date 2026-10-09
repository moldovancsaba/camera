import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const NOW = '2026-10-09T10:00:00.000Z';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, thumbnailUrl: null, isActive: true, createdAt: NOW, ...extra });

function setup(t: TestContext, options: { allowed?: boolean; role?: string; event?: Record<string, unknown> } = {}) {
  const seeded = fakeDb({
    logos: [logo('g1'), logo('g2'), logo('p1', { scope: 'partner', partnerId: 'P', source: 'messmass' }), logo('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: ['g1'] }, slots: { logo: { items: ['p1'] } } }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', isActive: true, logos: [], ...options.event }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _session: unknown, minRole: string) => {
        roles.push(minRole);
        return { allowed: options.allowed ?? true, role: options.role ?? 'admin', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const url = `http://localhost/api/events/${EVENT_MONGO_ID}/logo-slots`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
interface Panels { onModel: boolean; slots: Array<{ slotId: string; mode: string; effective: Array<{ id: string; level: string }>; defaultItems: Array<{ id: string }> }>; candidates: Array<{ id: string }> }

test('GET answers the panels of the event: its logo and each place of use, and the logos it can pick', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(new NextRequest(url), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Panels };
  assert.deepEqual(body.data.slots.map((s) => s.slotId), ['logo', 'logo-slideshow-transition', 'logo-pages', 'logo-slideshow-loading', 'logo-capture-loading']);
  const logoPanel = body.data.slots.find((s) => s.slotId === 'logo');
  assert.deepEqual(logoPanel?.defaultItems.map((i) => i.id), ['p1']);
  assert.deepEqual(body.data.candidates.map((c) => c.id).sort(), ['e1', 'g1', 'p1'], 'the partner library and the event\'s own upload, not the global logos the partner has not taken');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT: the event chooses; the first save seeds an event that is not on the model; the answer carries the new panels', async (t) => {
  const { data, roles } = setup(t, { event: { logos: [{ logoId: 'g1', scenario: 'onboarding-thankyou', order: 0, isActive: true }], logosOverridden: true } });
  const { PUT } = await importRoute('put');
  const response = await PUT(put({ slotId: 'logo-capture-loading', value: { items: ['e1'], useDefault: false } }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { seeded: boolean; panels: Panels } };
  assert.equal(body.data.seeded, true);
  assert.equal(body.data.panels.onModel, true);
  const place = body.data.panels.slots.find((s) => s.slotId === 'logo-capture-loading');
  assert.deepEqual(place?.effective.map((i) => i.id), ['e1']);
  assert.equal(place?.mode, 'replace');
  assert.equal((data.events[0] as { logos: unknown[] }).logos.length, 1, 'the old list is still there');
  assert.deepEqual(roles, ['manager']);
});

test('PUT refuses what the rules refuse: a logo that is not in the partner library, an unknown slot, a bad value; nothing is stored', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('refuse');
  assert.equal((await PUT(put({ slotId: 'logo', value: { items: ['g2'] } }), params)).status, 400);
  assert.equal((await PUT(put({ slotId: 'frames', value: { items: ['g1'] } }), params)).status, 400);
  assert.equal((await PUT(put({ slotId: 'logo', value: { items: 'g1' } }), params)).status, 400);
  assert.equal((await PUT(put({ value: {} }), params)).status, 400);
  assert.equal((data.events[0] as { slots?: unknown }).slots, undefined);
});

test('without access to the event nothing is read or stored', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ slotId: 'logo', value: { items: ['g1'] } }), params)).status, 403);
  assert.equal((data.events[0] as { slots?: unknown }).slots, undefined);
});
