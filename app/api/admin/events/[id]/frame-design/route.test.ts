import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import { DEFAULT_FRAME_MESSAGES } from '@/lib/frame/messages';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const session = { user: { id: 'u1', email: 'admin@example.com' }, appRole: 'admin', appAccess: true } as unknown as Session;
const design = {
  context: { source: 'messmass', fetchedAt: 'x', inputHash: 'h', event: { name: 'E', date: null, homeTeam: null, visitorTeam: null }, partner: null, template: null,
    style: { name: 'S', resolvedFrom: 'system-default', fontFamily: 'Inter', fontSource: 'google', fontFile: null, headingColor: 'a', heroBackground: 'b' } },
  messages: [...DEFAULT_FRAME_MESSAGES],
  messagesOverridden: false,
  updatedAt: 'x',
};

function setup(t: import('node:test').TestContext, options: { event?: Record<string, unknown> | null; deny?: boolean; imagesFail?: boolean } = {}) {
  const generated: unknown[] = [];
  const access: Array<{ id: string; role: unknown }> = [];
  const updates: unknown[] = [];
  const event = options.event === undefined ? { _id: new ObjectId(id), name: 'E', partnerId: 'p', frameDesign: design } : options.event;
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => event, updateOne: async (_f: unknown, u: unknown) => (updates.push(u), { matchedCount: 1 }) }),
      }),
    },
  });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, eventId: string, role: unknown) => {
        access.push({ id: eventId, role });
        if (options.deny) throw apiReal.apiForbidden('No access to this event');
      },
    },
  });
  t.mock.module('@/lib/frame/variants', {
    namedExports: {
      generateFrameVariants: async (_db: unknown, e: { frameDesign: object }) => {
        generated.push(e.frameDesign);
        if (options.imagesFail) throw new Error('blob down');
        return { design: { ...e.frameDesign, variants: [{}, {}] }, generated: 2, reused: 0 };
      },
    },
  });
  return { access, updates, generated };
}

const req = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/admin/events/${id}/frame-design`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (value = id) => ({ params: Promise.resolve({ id: value }) });

test('GET returns the snapshot, the default list and the limits to a viewer', async (t) => {
  const { access } = setup(t);
  const { GET } = await importRoute('get');
  const res = await GET(req('GET'), ctx());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(access, [{ id, role: 'viewer' }]);
  assert.equal(body.data.frameDesign.messagesOverridden, false);
  assert.deepEqual(body.data.defaultMessages, [...DEFAULT_FRAME_MESSAGES]);
  assert.deepEqual(body.data.limits, { maxMessages: 10, maxLength: 80 });
});

test('GET for an event without a snapshot returns null, not an error', async (t) => {
  setup(t, { event: { _id: new ObjectId(id), name: 'E' } });
  const { GET } = await importRoute('get-empty');
  assert.equal((await (await GET(req('GET'), ctx())).json()).data.frameDesign, null);
});

test('without access the answer is 403, and an unknown event is 404 only after access is granted', async (t) => {
  setup(t, { deny: true });
  const { GET } = await importRoute('get-denied');
  assert.equal((await GET(req('GET'), ctx())).status, 403);
});

test('an unknown event is 404 and a malformed id is 400', async (t) => {
  setup(t, { event: null });
  const { GET } = await importRoute('get-missing');
  assert.equal((await GET(req('GET'), ctx())).status, 404);
  assert.equal((await GET(req('GET'), ctx('nope'))).status, 400);
});

test('PUT saves a valid list as a manager and answers with the design', async (t) => {
  const { access, updates } = setup(t);
  const { PUT } = await importRoute('put');
  const res = await PUT(req('PUT', { messages: ['Go!', 'Let’s Go, {partner1}'] }), ctx());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(access, [{ id, role: 'manager' }]);
  assert.deepEqual(body.data.frameDesign.messages, ['Go!', 'Let’s Go, {partner1}']);
  assert.equal(body.data.frameDesign.messagesOverridden, true);
  assert.deepEqual(body.data.variants, { total: 2, generated: 2, reused: 0 });
  assert.equal(updates.length, 1);
});

test('PUT generates the images from the saved list, and a failure is a 502 after the list is saved', async (t) => {
  const ok = setup(t);
  const { PUT } = await importRoute('put-images');
  await PUT(req('PUT', { messages: ['Go!'] }), ctx());
  assert.deepEqual((ok.generated[0] as { messages: string[] }).messages, ['Go!']);
});

test('PUT answers 502 when the images cannot be generated', async (t) => {
  const { updates } = setup(t, { imagesFail: true });
  const { PUT } = await importRoute('put-images-fail');
  const res = await PUT(req('PUT', { messages: ['Go!'] }), ctx());
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /messages were saved/);
  assert.equal(updates.length, 1, 'the list is saved before the images are tried');
});

test('PUT with { reset: true } restores the default list', async (t) => {
  setup(t, { event: { _id: new ObjectId(id), name: 'E', frameDesign: { ...design, messages: ['x'], messagesOverridden: true } } });
  const { PUT } = await importRoute('put-reset');
  const body = await (await PUT(req('PUT', { reset: true }), ctx())).json();
  assert.deepEqual(body.data.frameDesign.messages, [...DEFAULT_FRAME_MESSAGES]);
  assert.equal(body.data.frameDesign.messagesOverridden, false);
});

test('PUT refuses a list the editor may not save, and a missing body, without writing', async (t) => {
  const { updates } = setup(t);
  const { PUT } = await importRoute('put-invalid');
  assert.equal((await PUT(req('PUT', { messages: Array.from({ length: 11 }, () => 'Go!') }), ctx())).status, 400);
  assert.equal((await PUT(req('PUT', { messages: ['Hi {coach}'] }), ctx())).status, 400);
  assert.equal((await PUT(req('PUT'), ctx())).status, 400);
  assert.equal(updates.length, 0);
});

test('PUT without access is 403 and writes nothing', async (t) => {
  const { updates } = setup(t, { deny: true });
  const { PUT } = await importRoute('put-denied');
  assert.equal((await PUT(req('PUT', { reset: true }), ctx())).status, 403);
  assert.equal(updates.length, 0);
});
