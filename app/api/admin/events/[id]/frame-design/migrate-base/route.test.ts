import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const EVENT_OID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const BASE = {
  images: [{ key: 'blue', imageUrl: 'https://pub.r2.dev/frames/blue.png' }, { key: 'pink', imageUrl: 'https://pub.r2.dev/frames/pink.png' }],
  messageImages: { 'MTK SZÍV!': 'pink' },
  messageBox: { x: 520, y: 8, width: 880, height: 90 },
};

function setup(t: TestContext, options: { allowed?: boolean; withBase?: boolean } = {}) {
  const seeded = fakeDb({
    frames: [],
    events: [{ _id: EVENT_OID, eventId: 'evt-uuid', partnerId: 'P', name: 'MTK x Vasas', frames: [], frameDesign: { messages: ['HAJRÁ', 'MTK SZÍV!'], messagesOverridden: true, context: {}, updatedAt: 'x', ...(options.withBase === false ? {} : { base: BASE }) } }],
  });
  const drawn: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async () => {
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level Events manager access is required');
        return { role: 'admin', partnerId: 'P' };
      },
    },
  });
  t.mock.module('@/lib/frame/variants', {
    namedExports: {
      generateFrameVariants: async (_db: unknown, event: { eventId: string }) => (drawn.push(event.eventId), { design: { variants: [{}, {}] }, generated: 2, reused: 0 }),
    },
  });
  return { ...seeded, drawn };
}

const post = (id: string, body: unknown) => [
  new NextRequest(`http://localhost/api/admin/events/${id}/frame-design/migrate-base`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id }) },
] as const;

test("moving the base picture creates the frames, chooses them for the messages and draws the images again", async (t) => {
  const { data, drawn } = setup(t);
  const { POST } = await importRoute('move');
  const response = await POST(...post(String(EVENT_OID), {}));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { frames: Array<{ key: string; created: boolean }>; messageFrames: Record<string, string>; variants: { total: number } } };
  assert.deepEqual(body.data.frames.map((f) => [f.key, f.created]), [['blue', true], ['pink', true]]);
  assert.equal(Object.keys(body.data.messageFrames).length, 2);
  assert.equal(data.frames.length, 2);
  assert.deepEqual(drawn, ['evt-uuid']);
});

test('the old data is removed only after the move, and the request needs an event id, an event, and the right access', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('retire');
  assert.equal((await POST(...post(String(EVENT_OID), { retire: true }))).status, 400, 'no message chooses a frame yet');
  assert.equal((await POST(...post(String(EVENT_OID), {}))).status, 200);
  assert.equal((await POST(...post(String(EVENT_OID), { retire: true }))).status, 200);
  assert.equal('base' in (data.events[0].frameDesign as object), false);
  assert.equal((await POST(...post('not-an-id', {}))).status, 400);
  assert.equal((await POST(...post(String(new ObjectId()), {}))).status, 404);
});

test('an event without a base picture answers with a plain 400, and without access nothing is created', async (t) => {
  const { data } = setup(t, { withBase: false });
  const { POST } = await importRoute('nobase');
  assert.equal((await POST(...post(String(EVENT_OID), {}))).status, 400);
  assert.equal(data.frames.length, 0);
});

test('a user without manager access to the event cannot move anything', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(...post(String(EVENT_OID), {}))).status, 403);
  assert.equal(data.frames.length, 0);
});
