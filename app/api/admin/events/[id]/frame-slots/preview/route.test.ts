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
const design = { context: { source: 'camera' }, messages: [...DEFAULT_FRAME_MESSAGES], messagesOverridden: false, updatedAt: 'x' };
const slots = { text: { 'top-left': { source: 'custom', text: 'Hello' } }, picture: {} };

function setup(t: import('node:test').TestContext, options: { deny?: boolean } = {}) {
  const previews: Array<{ slots: unknown; messageIndex: number | null }> = [];
  const access: unknown[] = [];
  const event = { _id: new ObjectId(id), name: 'E', frameDesign: design };
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => event }) }) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, _id: string, role: unknown) => {
        access.push(role);
        if (options.deny) throw apiReal.apiForbidden('No access to this event');
      },
    },
  });
  t.mock.module('@/lib/frame/preview', {
    namedExports: {
      previewSlots: async (_design: unknown, s: unknown, messageIndex: number | null) => {
        previews.push({ slots: s, messageIndex });
        return { png: Buffer.from('PNG'), width: 1920, height: 1080, notes: ['a note'], message: 'Go' };
      },
    },
  });
  return { previews, access };
}

const req = (body?: unknown) => new NextRequest(`http://localhost/api/admin/events/${id}/frame-slots/preview`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (value = id) => ({ params: Promise.resolve({ id: value }) });

test('POST answers a picture of the draft as a data address with the notes, and saves nothing', async (t) => {
  const { previews, access } = setup(t);
  const { POST } = await importRoute('ok');
  const res = await POST(req({ slots, messageIndex: 2 }), ctx());
  assert.equal(res.status, 200);
  const data = ((await res.json()) as { data: { imageDataUrl: string; notes: string[]; message: string; width: number } }).data;
  assert.equal(data.imageDataUrl, `data:image/png;base64,${Buffer.from('PNG').toString('base64')}`);
  assert.deepEqual([data.notes, data.message, data.width], [['a note'], 'Go', 1920]);
  assert.deepEqual(previews, [{ slots, messageIndex: 2 }]);
  assert.deepEqual(access, ['manager']);
});

test('POST refuses slots that are not valid, no body and a bad id', async (t) => {
  const { previews } = setup(t);
  const { POST } = await importRoute('refuse');
  const bad = await POST(req({ slots: { text: { nowhere: { source: 'teams' } } } }), ctx());
  assert.equal(bad.status, 400);
  assert.equal((await POST(req(), ctx())).status, 400);
  assert.equal((await POST(req({ slots }), ctx('nope'))).status, 400);
  assert.equal(previews.length, 0);
});

test('POST is refused for a caller without access', async (t) => {
  const { previews } = setup(t, { deny: true });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(req({ slots }), ctx())).status, 403);
  assert.equal(previews.length, 0);
});
