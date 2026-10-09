import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const SLIDESHOW = { slideshowId: 's1', eventId: 'evt-1' };
const EVENT = { _id: { toString: () => 'a'.repeat(24) }, eventId: 'evt-1' };

/** A fake database with one slideshow and one event, recording what the route writes. */
function mockWorld(t: TestContext, options: { slideshow?: object | null; event?: object | null; access?: 'ok' | 'forbidden'; signedIn?: boolean }) {
  const writes: Array<{ filter: unknown; update: unknown }> = [];
  const forbidden = apiReal.apiForbidden('Partner-level Events manager access is required');
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      requireAuth: async () => {
        if (options.signedIn === false) throw apiReal.apiUnauthorized();
        return { user: { id: 'u1', email: 'manager@example.test' } };
      },
    },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) =>
          name === 'slideshows'
            ? { findOne: async () => (options.slideshow === undefined ? SLIDESHOW : options.slideshow), updateOne: async (filter: unknown, update: unknown) => void writes.push({ filter, update }) }
            : { findOne: async () => (options.event === undefined ? EVENT : options.event) },
      }),
    },
  });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async () => {
        if (options.access === 'forbidden') throw forbidden;
        return { role: 'manager', partnerId: 'p1' };
      },
    },
  });
  return writes;
}

const call = async (caseId: string, id = 's1') => {
  const { POST } = await importRoute(caseId);
  return POST(new NextRequest(`http://localhost/api/slideshows/${id}/reload`, { method: 'POST' }), { params: Promise.resolve({ slideshowId: id }) });
};

test('a manager of the event stores the time of the request on the slideshow and gets it back', async (t) => {
  const writes = mockWorld(t, {});
  const res = await call('ok');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data?: { reloadRequestedAt?: string }; reloadRequestedAt?: string };
  const stored = (writes[0].update as { $set: { reloadRequestedAt: string } }).$set.reloadRequestedAt;
  assert.match(stored, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.data?.reloadRequestedAt ?? body.reloadRequestedAt, stored);
  assert.deepEqual(writes[0].filter, { slideshowId: 's1' });
});

test('somebody who is not signed in changes nothing', async (t) => {
  const writes = mockWorld(t, { signedIn: false });
  assert.equal((await call('anon')).status, 401);
  assert.equal(writes.length, 0);
});

test('somebody without manager access to the event changes nothing', async (t) => {
  const writes = mockWorld(t, { access: 'forbidden' });
  assert.equal((await call('forbidden')).status, 403);
  assert.equal(writes.length, 0);
});

test('an unknown slideshow answers 404 and changes nothing', async (t) => {
  const writes = mockWorld(t, { slideshow: null });
  assert.equal((await call('no-show')).status, 404);
  assert.equal(writes.length, 0);
});

test('a slideshow whose event is gone answers 404 and changes nothing', async (t) => {
  const writes = mockWorld(t, { event: null });
  assert.equal((await call('no-event')).status, 404);
  assert.equal(writes.length, 0);
});
