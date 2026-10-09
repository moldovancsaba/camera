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
const slots = { text: { 'top-left': { source: 'custom', text: 'Hello' } }, picture: {} };

function setup(t: import('node:test').TestContext, options: { deny?: boolean; imagesFail?: boolean } = {}) {
  const generated: unknown[] = [];
  const access: Array<{ id: string; role: unknown }> = [];
  const updates: unknown[] = [];
  const event = { _id: new ObjectId(id), name: 'E', partnerId: 'p', frameDesign: design };
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => event, updateOne: async (_f: unknown, u: unknown) => (updates.push(u), { matchedCount: 1 }) }) }) } });
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

const req = (body?: unknown) => new NextRequest(`http://localhost/api/admin/events/${id}/frame-slots`, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (value = id) => ({ params: Promise.resolve({ id: value }) });

test('PUT saves the slots for a manager and draws the images', async (t) => {
  const { access, updates, generated } = setup(t);
  const { PUT } = await importRoute('save');
  const res = await PUT(req({ slots }), ctx());
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { frameDesign: { slots: unknown }; variants: { total: number; generated: number } } };
  assert.deepEqual(body.data.frameDesign.slots, slots);
  assert.deepEqual(body.data.variants, { total: 2, generated: 2, reused: 0 });
  assert.deepEqual(access, [{ id, role: 'manager' }]);
  assert.equal(updates.length, 1);
  assert.equal(generated.length, 1);
});

test('PUT with reset gives the event the default frame again', async (t) => {
  const { updates } = setup(t);
  const { PUT } = await importRoute('reset');
  const res = await PUT(req({ reset: true }), ctx());
  assert.equal(res.status, 200);
  assert.deepEqual((updates[0] as { $unset: unknown }).$unset, { 'frameDesign.slots': '' });
});

test('PUT refuses slots that are not valid with the reason, no body and an invalid id', async (t) => {
  setup(t);
  const { PUT } = await importRoute('refuse');
  const bad = await PUT(req({ slots: { picture: { 'top-center': { source: 'partnerLogo' } } } }), ctx());
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(await bad.json()), /cannot show the partner logo here/);
  assert.equal((await PUT(req(), ctx())).status, 400);
  assert.equal((await PUT(req({ slots }), ctx('not-an-id'))).status, 400);
});

test('PUT is refused for a caller without access, and nothing is written', async (t) => {
  const { updates, generated } = setup(t, { deny: true });
  const { PUT } = await importRoute('denied');
  assert.equal((await PUT(req({ slots }), ctx())).status, 403);
  assert.equal(updates.length + generated.length, 0);
});

test('PUT answers 502 when the images cannot be drawn: the slots are saved, the message says to repeat', async (t) => {
  const { updates } = setup(t, { imagesFail: true });
  const { PUT } = await importRoute('fail');
  const res = await PUT(req({ slots }), ctx());
  assert.equal(res.status, 502);
  assert.equal(updates.length, 1);
});
