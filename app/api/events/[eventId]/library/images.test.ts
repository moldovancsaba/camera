import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// The event library route with kind=images (camera#368): nothing is assigned; the list is what the event's picture fields may choose from.
const apiReal = await import('@/lib/api');

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const picture = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Picture ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    images: [
      picture('g1'),
      picture('g2'),
      picture('p1', { scope: 'partner', partnerId: 'P' }),
      picture('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' }),
      picture('e2', { scope: 'event', eventId: 'other-uuid', partnerId: 'P' }),
    ],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: [], images: ['g1'] } }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

test("GET kind=images lists the event's images library: its partner's library and its own uploads, nothing assigned", async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library?kind=images`), { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { assigned: unknown[]; missing: unknown[]; available: Array<{ id: string; scope: string; imageUrl: string }> } };
  assert.deepEqual(body.data.assigned, []);
  assert.deepEqual(body.data.missing, []);
  // g1 is in the partner library, p1 is the partner's upload, e1 the event's own; g2 is global but the partner does not have it; e2 is another event's.
  assert.deepEqual(body.data.available.map((i) => i.id).sort(), ['e1', 'g1', 'p1']);
  assert.equal(body.data.available.find((i) => i.id === 'e1')?.imageUrl, 'https://img.example/e1.png');
});
