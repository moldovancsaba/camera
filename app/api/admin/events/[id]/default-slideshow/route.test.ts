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

const refreshes: Array<{ eventId: unknown; options: unknown }> = [];

function setup(t: TestContext, options: { denied?: boolean; ensure?: { ok: true; slideshowId: string; created: boolean } | { ok: false; reason: string } } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', name: 'Event', partnerId: 'P' }],
    slideshows: [
      { slideshowId: 's-old', eventId: 'e-uuid', name: 'Generated', isDefault: true },
      { slideshowId: 's-new', eventId: 'e-uuid', name: 'Mine' },
      { slideshowId: 's-other', eventId: 'other-event', name: 'Not this event\'s' },
    ],
  });
  const roles: string[] = [];
  refreshes.length = 0;
  t.mock.module('@/lib/screen/welcome-screen-store', { namedExports: { scheduleWelcomeScreen: (eventId: unknown, options: unknown) => refreshes.push({ eventId, options }) } });
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
  t.mock.module('@/lib/slideshow/default-slideshow', { namedExports: { ensureDefaultSlideshow: async () => options.ensure ?? { ok: true, slideshowId: 's-old', created: false } } });
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ id: String(EVENT_MONGO_ID) }) };
const url = `http://localhost/api/admin/events/${EVENT_MONGO_ID}/default-slideshow`;
const req = (method: string, body?: unknown) => new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const flags = (data: Record<string, Array<Record<string, unknown>>>) => Object.fromEntries(data.slideshows.map((s) => [s.slideshowId as string, s.isDefault === true]));

test('POST answers the default slideshow of the event, made or already there, for a manager', async (t) => {
  const { roles } = setup(t, { ensure: { ok: true, slideshowId: 's-made', created: true } });
  const { POST } = await importRoute('post');
  const response = await POST(req('POST'), params);
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { data: unknown }).data, { slideshowId: 's-made', created: true });
  assert.deepEqual(roles, ['manager']);
});

test('POST says so when it could not be made (the picture or the link failed)', async (t) => {
  setup(t, { ensure: { ok: false, reason: 'No free slug was found. Try again.' } });
  const { POST } = await importRoute('post-fail');
  assert.equal((await POST(req('POST'), params)).status, 503);
});

test('PUT makes another slideshow of the event the default and takes the flag off the old one: one default, never none', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put');
  const response = await PUT(req('PUT', { slideshowId: 's-new' }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(flags(data), { 's-old': false, 's-new': true, 's-other': false });
  assert.deepEqual(refreshes.map((r) => r.options), [{ onlyIfExists: true }], 'a welcome page screen picture the event already has is redrawn from the new default; none is made for an event without one');
});

test('PUT refuses a slideshow of another event or an unknown one, and changes nothing', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put-refuse');
  assert.equal((await PUT(req('PUT', { slideshowId: 's-other' }), params)).status, 404);
  assert.equal((await PUT(req('PUT', { slideshowId: 'nope' }), params)).status, 404);
  assert.equal((await PUT(req('PUT', {}), params)).status, 400);
  assert.deepEqual(flags(data), { 's-old': true, 's-new': false, 's-other': false });
  assert.equal(refreshes.length, 0);
});

test('without access nothing is changed', async (t) => {
  const { data } = setup(t, { denied: true });
  const { PUT } = await importRoute('denied');
  assert.equal((await PUT(req('PUT', { slideshowId: 's-new' }), params)).status, 403);
  assert.deepEqual(flags(data), { 's-old': true, 's-new': false, 's-other': false });
});
