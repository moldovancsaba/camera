import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
const params = { params: Promise.resolve({ id: String(EVENT_ID) }) };
const url = `http://localhost/api/admin/events/${EVENT_ID}/welcome-photos`;

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_ID, eventId: 'E', name: 'Match' }],
    submissions: [
      { _id: new ObjectId(), eventId: 'E', eventIds: ['E'], imageUrl: 'https://i.ibb.co/x/guest.png', reviewStatus: 'approved', userEmail: 'secret@example.com', createdAt: '2026-10-10T10:00:00.000Z' },
      { _id: new ObjectId(), eventId: 'E', eventIds: ['E'], imageUrl: 'https://i.ibb.co/x/framed.png', originalImageUrl: 'https://i.ibb.co/x/plain.png', metadata: { adminGalleryUpload: true, galleryFrame: true }, createdAt: '2026-10-09T10:00:00.000Z' },
      { _id: new ObjectId(), eventId: 'E', eventIds: ['E'], imageUrl: 'https://i.ibb.co/x/pending.png', reviewStatus: 'pending_review' },
    ],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _session: unknown, _id: string, role: string) => {
        roles.push(role);
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level access is required');
      },
    },
  });
  return { ...seeded, roles };
}

test('GET lists the photos that can be shown, the editor’s clean uploads first, with no guest data', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(new NextRequest(url), params);
  assert.equal(response.status, 200);
  const text = JSON.stringify(await response.json());
  const body = JSON.parse(text) as { data: { photos: Array<{ kind: string; imageUrl: string }> } };
  assert.deepEqual(body.data.photos.map((p) => p.kind), ['clean', 'framed']);
  assert.equal(body.data.photos[0].imageUrl, 'https://i.ibb.co/x/plain.png');
  assert.doesNotMatch(text, /secret@|pending\.png/);
  assert.deepEqual(roles, ['viewer']);
});

test('a user without the right is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
});
