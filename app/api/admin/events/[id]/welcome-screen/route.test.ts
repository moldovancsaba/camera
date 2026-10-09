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

function setup(t: TestContext, options: { denied?: boolean; slideshow?: { ok: true; slideshowId: string; created: boolean } | { ok: false; reason: string }; screen?: { ok: true; url: string; created: boolean } | { ok: false; reason: string } } = {}) {
  const seeded = fakeDb({ events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', name: 'Event', partnerId: 'P' }] });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _session: unknown, _id: string, minRole: string) => {
        roles.push(minRole);
        if (options.denied) throw apiReal.apiError('Forbidden', 403);
      },
    },
  });
  t.mock.module('@/lib/slideshow/default-slideshow', { namedExports: { ensureDefaultSlideshow: async () => options.slideshow ?? { ok: true, slideshowId: 's1', created: true } } });
  t.mock.module('@/lib/screen/welcome-screen-store', { namedExports: { ensureWelcomeScreen: async () => options.screen ?? { ok: true, url: 'https://blob.example/screens/e-uuid/welcome-1.png', created: true } } });
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ id: String(EVENT_MONGO_ID) }) };
const post = () => new NextRequest(`http://localhost/api/admin/events/${EVENT_MONGO_ID}/welcome-screen`, { method: 'POST' });

test('POST draws the picture for a manager and answers its address', async (t) => {
  const { roles } = setup(t);
  const { POST } = await importRoute('ok');
  const response = await POST(post(), params);
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { data: unknown }).data, { url: 'https://blob.example/screens/e-uuid/welcome-1.png', created: true });
  assert.deepEqual(roles, ['manager']);
});

test('POST says why when the default slideshow or the picture could not be made', async (t) => {
  setup(t, { slideshow: { ok: false, reason: 'No free slug was found. Try again.' } });
  assert.equal((await (await importRoute('no-slideshow')).POST(post(), params)).status, 503);
});

test('POST says why when the picture could not be drawn', async (t) => {
  setup(t, { screen: { ok: false, reason: 'The overlay picture of the screen design could not be fetched.' } });
  const response = await (await importRoute('no-screen')).POST(post(), params);
  assert.equal(response.status, 503);
  assert.match(((await response.json()) as { error: string }).error, /overlay/);
});

test('without access nothing is drawn', async (t) => {
  setup(t, { denied: true });
  assert.equal((await (await importRoute('denied')).POST(post(), params)).status, 403);
});
