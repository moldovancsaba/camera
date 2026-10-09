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

function setup(t: TestContext, options: { allowed?: boolean; lost?: boolean } = {}) {
  const seeded = fakeDb({
    logos: [logo('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: [] } }],
    events: [
      {
        _id: EVENT_MONGO_ID,
        eventId: 'e-uuid',
        partnerId: 'P',
        name: 'Event',
        slots: { logo: { items: ['e1'] } },
        slotSnapshots: { 'logo-pages': [{ id: 'e1', name: 'Logo e1', imageUrl: 'https://img.example/e1.png', thumbnailUrl: null, mimeType: null, width: null, height: null, scope: 'event', takenAt: NOW }] },
      },
    ],
  });
  if (options.lost !== false) seeded.data.logos.splice(0, 1);
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _session: unknown, minRole: string) => {
        roles.push(minRole);
        return { allowed: options.allowed ?? true, role: 'admin', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const post = (body: unknown) => new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/logo-slots/keep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('POST keeps a lost logo as the event\'s own and answers the new panels with nothing lost', async (t) => {
  const { data, roles } = setup(t);
  const { POST } = await importRoute('keep');
  const response = await POST(post({ id: 'e1' }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { logoId: string; places: string[]; panels: { slots: Array<{ effective: Array<{ id: string; lost?: boolean }> }> } } };
  assert.notEqual(body.data.logoId, 'e1');
  assert.ok(data.logos.some((l) => l.logoId === body.data.logoId && l.scope === 'event'));
  assert.ok(body.data.panels.slots.every((s) => s.effective.every((i) => !i.lost)));
  assert.deepEqual(roles, ['manager']);
});

test('POST refuses a logo that is not lost and a missing id; nothing is created', async (t) => {
  const { data } = setup(t, { lost: false });
  const { POST } = await importRoute('refuse');
  assert.equal((await POST(post({ id: 'e1' }), params)).status, 400, 'still in the library');
  assert.equal((await POST(post({}), params)).status, 400);
  assert.equal(data.logos.length, 1);
});

test('POST without manager access creates nothing', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(post({ id: 'e1' }), params)).status, 403);
  assert.equal(data.logos.length, 0);
});
