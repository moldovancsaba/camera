import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { accepted?: boolean } = {}) {
  const seeded = fakeDb({
    events: [
      { _id: EVENT_MONGO_ID, eventId: 'e-uuid', shortUrlSlug: 'mtk', name: 'MTK x Vasas', isActive: true },
      { _id: new ObjectId(), eventId: 'e-off', name: 'Closed', isActive: false },
    ],
  });
  const registered: Array<{ event: Record<string, unknown>; input: unknown }> = [];
  const limits: unknown[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, checkRateLimit: async (_request: unknown, limit: unknown) => void limits.push(limit) } });
  t.mock.module('@/lib/email/triggers', {
    namedExports: { registerVisitor: async (_db: unknown, event: Record<string, unknown>, input: unknown) => (registered.push({ event, input }), options.accepted ?? true) },
  });
  return { registered, limits };
}
const post = (key: string, body: unknown) => [
  new NextRequest(`http://localhost/api/events/${key}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  { params: Promise.resolve({ eventId: key }) },
] as const;

test('an event is found by its id, its uuid or its URL slug, the call is rate limited, and the answer says nothing about e-mails', async (t) => {
  const { registered, limits } = setup(t);
  const { POST } = await importRoute('found');
  for (const key of [String(EVENT_MONGO_ID), 'e-uuid', 'mtk']) {
    const response = await POST(...post(key, { name: 'Anna', email: 'anna@example.com' }));
    assert.equal(response.status, 200, key);
    assert.deepEqual(((await response.json()) as { data: unknown }).data, { registered: true });
  }
  assert.equal(registered.length, 3);
  assert.deepEqual(registered[0].input, { name: 'Anna', email: 'anna@example.com' });
  assert.equal(limits.length, 3, 'rate limited');
});

test('an unknown or closed event is not found, an address that is not an e-mail address is refused, a body that is not JSON is refused', async (t) => {
  const { registered } = setup(t, { accepted: false });
  const { POST } = await importRoute('refused');
  assert.equal((await POST(...post('nope', { email: 'anna@example.com' }))).status, 404);
  assert.equal((await POST(...post('e-off', { email: 'anna@example.com' }))).status, 404, 'a closed event');
  assert.equal((await POST(...post('e-uuid', { email: 'nope' }))).status, 400);
  assert.equal((await POST(...post('e-uuid', 'not json'))).status, 400);
  assert.equal(registered.length, 1, 'only the call with a known open event reached the registration');
});
