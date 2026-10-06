import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const session = { user: { id: 'u1', email: 'admin@example.com' }, appRole: 'admin', appAccess: true } as unknown as Session;

function setup(t: import('node:test').TestContext, options: { event?: Record<string, unknown> | null; deny?: boolean } = {}) {
  const refreshed: unknown[] = [];
  const access: unknown[] = [];
  const event = options.event === undefined ? { _id: new ObjectId(id), name: 'E' } : options.event;
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => event }) }) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, eventId: string, role: unknown) => {
        access.push({ eventId, role });
        if (options.deny) throw apiReal.apiForbidden('No access to this event');
      },
    },
  });
  t.mock.module('@/lib/frame/sync', {
    namedExports: {
      refreshFrameDesign: async (_db: unknown, e: unknown) => (refreshed.push(e), { design: { messages: ['Go!'] }, changed: true, messmassUnavailable: false }),
    },
  });
  return { refreshed, access };
}

const call = (POST: RouteModule['POST'], value = id) =>
  POST(new NextRequest(`http://localhost/api/admin/events/${value}/frame-design/refresh`, { method: 'POST' }), { params: Promise.resolve({ id: value }) });

test('a manager refreshes the snapshot and learns whether anything changed', async (t) => {
  const { refreshed, access } = setup(t);
  const { POST } = await importRoute('ok');
  const res = await call(POST);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(access, [{ eventId: id, role: 'manager' }]);
  assert.equal(refreshed.length, 1);
  assert.deepEqual(body.data, { frameDesign: { messages: ['Go!'] }, changed: true, messmassUnavailable: false });
});

test('without access the answer is 403 and messmass is not asked', async (t) => {
  const { refreshed } = setup(t, { deny: true });
  const { POST } = await importRoute('denied');
  assert.equal((await call(POST)).status, 403);
  assert.equal(refreshed.length, 0);
});

test('a malformed id is 400 and an unknown event is 404', async (t) => {
  setup(t, { event: null });
  const { POST } = await importRoute('missing');
  assert.equal((await call(POST, 'nope')).status, 400);
  assert.equal((await call(POST)).status, 404);
});
