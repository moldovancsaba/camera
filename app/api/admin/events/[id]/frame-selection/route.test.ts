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

const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 } };
const MESSAGES = ['HAJRÁ, MTK!', 'SZÍVEM KÉK-FEHÉR!', 'MTK SZÍV!', 'MINDEN NŐ SZÁMÍT!'];
const ROW = (frameId: string) => ({ frameId, isActive: true, addedAt: 'x', addedBy: 'u' });

function setup(t: TestContext, options: { denied?: boolean } = {}) {
  const seeded = fakeDb({
    events: [
      {
        _id: EVENT_MONGO_ID,
        eventId: 'e-uuid',
        name: 'MTK x Vasas',
        frames: [ROW('blue'), ROW('pink')],
        frameDesign: { messages: MESSAGES, messageFrames: { 'HAJRÁ, MTK!': 'blue', 'SZÍVEM KÉK-FEHÉR!': 'blue', 'MTK SZÍV!': 'pink', 'MINDEN NŐ SZÁMÍT!': 'pink' } },
      },
    ],
    frames: ['blue', 'pink'].map((frameId) => ({ frameId, name: frameId, imageUrl: `https://img.example/${frameId}.png`, isActive: true, messageArea: AREA })),
  });
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
  return { ...seeded, roles };
}

const params = { params: Promise.resolve({ id: String(EVENT_MONGO_ID) }) };
const url = `http://localhost/api/admin/events/${EVENT_MONGO_ID}/frame-selection`;
const req = (method: string, body?: unknown) => new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
type Answer = { data: { layouts: Array<{ id: string }>; messages: unknown[]; situation: string; selection: unknown; today: unknown } };

test('GET answers the layouts, the messages, the situation and what the event does until a setting is saved, for a viewer', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(req('GET'), params);
  assert.equal(response.status, 200);
  const { data } = (await response.json()) as Answer;
  assert.deepEqual(data.layouts.map((layout) => layout.id), ['blue', 'pink']);
  assert.equal(data.messages.length, 4);
  assert.equal(data.situation, 'C');
  assert.equal(data.selection, null);
  assert.deepEqual(roles, ['viewer']);
});

test('PUT saves the setting for a manager, answers the new state, and a null takes it away again', async (t) => {
  const { data, roles } = setup(t);
  const { PUT } = await importRoute('put');
  const both = { layout: { mode: 'user' }, message: { mode: 'user' } };
  const saved = await PUT(req('PUT', { selection: both }), params);
  assert.equal(saved.status, 200);
  assert.deepEqual(data.events[0].frameSelection, { layout: { mode: 'user', pick: null }, message: { mode: 'user', pick: null } });
  assert.deepEqual(((await saved.json()) as Answer).data.selection, data.events[0].frameSelection);
  const picked = await PUT(req('PUT', { selection: { layout: { mode: 'editor', pick: 'pink' }, message: { mode: 'editor', pick: 'MINDEN NŐ SZÁMÍT!' } } }), params);
  assert.equal(picked.status, 200);
  assert.equal((data.events[0].frameSelection as unknown as { layout: { pick: string } }).layout.pick, 'pink');
  assert.equal((await PUT(req('PUT', { selection: null }), params)).status, 200);
  assert.equal('frameSelection' in data.events[0], false);
  assert.deepEqual(roles, ['manager', 'manager', 'manager']);
});

test('PUT refuses a pick that is not a layout or message of the event and a body that is not a setting, and writes nothing', async (t) => {
  const { data } = setup(t);
  const { PUT } = await importRoute('put-bad');
  for (const selection of [
    { layout: { mode: 'editor', pick: 'green' }, message: { mode: 'user' } },
    { layout: { mode: 'user' }, message: { mode: 'editor', pick: 'Nope' } },
    { layout: { mode: 'sometimes' }, message: { mode: 'user' } },
    'user',
  ]) {
    assert.equal((await PUT(req('PUT', { selection }), params)).status, 400, JSON.stringify(selection));
  }
  assert.equal((await PUT(req('PUT', {}), params)).status, 400, 'a body without a selection');
  assert.equal('frameSelection' in data.events[0], false);
});

test('a caller without access to the event is refused before anything is read or written', async (t) => {
  const { data } = setup(t, { denied: true });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(req('GET'), params)).status, 403);
  assert.equal((await PUT(req('PUT', { selection: null }), params)).status, 403);
  assert.equal('frameSelection' in data.events[0], false);
});
