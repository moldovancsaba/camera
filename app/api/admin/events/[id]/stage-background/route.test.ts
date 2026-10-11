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

function setup(t: TestContext, options: { event?: Record<string, unknown>; redraw?: { ok: true; changed: boolean; url: string } | { ok: false; reason: string }; allowed?: boolean } = {}) {
  const seeded = fakeDb({ events: [{ _id: EVENT_MONGO_ID, eventId: 'E', name: 'Match', ...options.event }] });
  const roles: string[] = [];
  const redraws: Array<{ again: unknown }> = [];
  const welcome: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _session: unknown, _id: string, minRole: string) => {
        roles.push(minRole);
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level access is required');
      },
    },
  });
  t.mock.module('@/lib/screen/stage-redraw', {
    namedExports: {
      stageState: async () => ({ slideshowId: 's1', generated: true, pick: null, available: 2, overlayUrl: 'https://blob.example/screens/E/default-0123456789abcdef.png' }),
      redrawStage: async (_db: unknown, _event: unknown, _deps: unknown, o: { again?: boolean }) => (redraws.push({ again: o.again }), options.redraw ?? { ok: true, changed: true, url: 'https://blob.example/new.png' }),
    },
  });
  t.mock.module('@/lib/screen/welcome-screen-store', { namedExports: { ensureWelcomeScreen: async (_db: unknown, event: { eventId: string }) => (welcome.push(event.eventId), { ok: true, url: 'x', created: true }) } });
  return { ...seeded, roles, redraws, welcome };
}

const id = String(EVENT_MONGO_ID);
const params = { params: Promise.resolve({ id }) };
const url = `http://localhost/api/admin/events/${id}/stage-background`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET tells the state of the stage to anyone who can see the event', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET(new NextRequest(url), params)).json()) as { data: { generated: boolean; available: number } };
  assert.deepEqual([body.data.generated, body.data.available], [true, 2]);
  assert.deepEqual(roles, ['viewer']);
});

test('PUT draws the stage again, passes "again" on, answers with the new state, and draws the welcome page screen after it only when the stage changed and the event has that picture', async (t) => {
  const w = setup(t, { event: { welcomeScreen: { url: 'https://blob.example/w.png', key: 'k' } } });
  const { PUT } = await importRoute('put');
  assert.equal((await PUT(put({ again: true }), params)).status, 200);
  assert.deepEqual(w.redraws, [{ again: true }]);
  assert.deepEqual(w.welcome, ['E']);
  assert.ok(w.roles.includes('manager'));
  assert.equal((await PUT(put({}), params)).status, 200);
  assert.deepEqual(w.redraws.at(-1), { again: false });
  assert.equal(w.welcome.length, 2);
});

test('an event without the welcome page screen picture is not given one when its stage is drawn', async (t) => {
  const none = setup(t);
  const { PUT } = await importRoute('put-nopicture');
  assert.equal((await PUT(put({}), params)).status, 200);
  assert.deepEqual(none.welcome, []);
});

test('an unchanged stage does not draw the welcome page screen again', async (t) => {
  const w = setup(t, { event: { welcomeScreen: { url: 'https://blob.example/w.png', key: 'k' } }, redraw: { ok: true, changed: false, url: 'https://blob.example/same.png' } });
  const { PUT } = await importRoute('put-unchanged');
  assert.equal((await PUT(put({}), params)).status, 200);
  assert.deepEqual(w.welcome, []);
});

test('a slideshow whose stage picture an editor chose is refused with 409, and a bad body with 400', async (t) => {
  setup(t, { redraw: { ok: false, reason: 'The default slideshow has a stage picture of its own, so a stadium background does not apply to it.' } });
  const { PUT } = await importRoute('put-refused');
  assert.equal((await PUT(put({}), params)).status, 409);
  assert.equal((await PUT(put({ again: 'yes' }), params)).status, 400);
});

test('an event with no default slideshow cannot have its stage drawn: 503 with the reason', async (t) => {
  setup(t, { redraw: { ok: false, reason: 'The event has no default slideshow.' } });
  const { PUT } = await importRoute('put-missing');
  const response = await PUT(put({}), params);
  assert.equal(response.status, 503);
  assert.match(((await response.json()) as { error: string }).error, /no default slideshow/);
});

test('a user without the right is refused', async (t) => {
  setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({}), params)).status, 403);
});
