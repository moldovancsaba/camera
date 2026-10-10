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
const url = `http://localhost/api/admin/events/${EVENT_ID}/welcome-window`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// One list for the file: lib/screen/welcome-screen-store is loaded once, with the mock of the first test that loads it.
const draws: Array<{ again?: boolean; source?: string }> = [];

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_ID, eventId: 'E', partnerId: 'P', name: 'Match', welcomeWindow: { pick: { pictureId: 's1', pickedAt: 'x' } }, welcomeScreen: { url: 'https://blob.example/w.png', key: 'k', generatedAt: '2026-10-10T12:00:00.000Z' } }],
    images: [{ pictureId: 's1', name: 'Fan with a scarf', imageUrl: 'https://store.public.blob.vercel-storage.com/s1.png', isActive: true, tags: ['sample-selfie'] }],
  });
  draws.length = 0;
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _session: unknown, _id: string, role: string) => {
        roles.push(role);
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level access is required');
      },
    },
  });
  t.mock.module('@/lib/slideshow/default-slideshow', { namedExports: { ensureDefaultSlideshow: async () => ({ ok: true }) } });
  t.mock.module('@/lib/screen/welcome-screen-store', {
    namedExports: {
      ensureWelcomeScreen: async (_db: unknown, event: { welcomeWindow?: { source?: string } }, _deps: unknown, o: { again?: boolean } = {}) => {
        draws.push({ again: o.again, source: event.welcomeWindow?.source });
        return { ok: true, url: 'https://blob.example/w.png', created: true };
      },
    },
  });
  return { ...seeded, roles };
}

interface Body { data: { source: string; pick: { id: string; name: string } | null; welcomeScreen: { url: string } | null } }

test('GET: the setting (the sample selfie unless the stand-in was chosen), the sample selfie picked for the event and the stored picture', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as Body;
  assert.equal(body.data.source, 'selfie');
  assert.deepEqual(body.data.pick, { id: 's1', name: 'Fan with a scarf', imageUrl: 'https://store.public.blob.vercel-storage.com/s1.png' });
  assert.equal(body.data.welcomeScreen?.url, 'https://blob.example/w.png');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT: keeping the stand-in is stored and the picture is drawn again; the sample selfie is the default and is stored as nothing; Pick another asks for another one', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const standIn = await PUT(put({ source: 'standin' }), params);
  assert.equal(standIn.status, 200);
  assert.equal(((await standIn.json()) as Body).data.source, 'standin');
  assert.deepEqual((data.events[0].welcomeWindow as Record<string, unknown>).source, 'standin');
  assert.deepEqual(draws.at(-1), { again: undefined, source: 'standin' });
  const back = await PUT(put({ source: 'selfie' }), params);
  assert.equal(((await back.json()) as Body).data.source, 'selfie');
  assert.equal((data.events[0].welcomeWindow as Record<string, unknown>).source, undefined);
  assert.equal((await PUT(put({ again: true }), params)).status, 200);
  assert.deepEqual(draws.at(-1), { again: true, source: undefined });
  assert.equal((await PUT(put({}), params)).status, 200, 'an empty request draws it again');
  assert.ok(roles.every((role) => role === 'manager'));
});

test('PUT: an unknown source or field, or a body that is not JSON, is refused and draws nothing', async (t) => {
  setup(t);
  const { PUT } = await importRoute('bad');
  for (const bad of [{ source: 'photo' }, { again: 'yes' }, { other: 1 }, 5]) assert.equal((await PUT(put(bad), params)).status, 400, JSON.stringify(bad));
  assert.equal((await PUT(new NextRequest(url, { method: 'PUT', body: 'not json' }), params)).status, 400);
  assert.equal(draws.length, 0);
});

test('a user without the right is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({}), params)).status, 403);
  assert.equal(draws.length, 0);
});
