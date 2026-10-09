import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_ID = new ObjectId();
const PARTNER_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { denied?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_ID, eventId: 'e-uuid', name: 'MTK x Vasas', partnerId: 'P' }],
    partners: [{ _id: PARTNER_ID, partnerId: 'P', name: 'MTK Budapest' }],
  });
  const checks: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, _id: string, role: string) => {
        checks.push(`event:${role}`);
        if (options.denied) throw apiReal.apiError('Forbidden', 403);
      },
      assertPartnerMongoWorkspaceAccess: async (db: { collection: (n: string) => { findOne: (f: unknown) => Promise<Record<string, unknown> | null> } }, _s: unknown, id: string, role: string) => {
        checks.push(`partner:${role}`);
        if (options.denied) throw apiReal.apiError('Forbidden', 403);
        return { partner: await db.collection('partners').findOne({ _id: new ObjectId(id) }), role: 'viewer', partnerId: 'P' };
      },
    },
  });
  return checks;
}

const get = (query: string) => new NextRequest(`http://localhost/api/admin/nav-context?${query}`);
const nameOf = async (response: Response) => ((await response.json()) as { data: { name: string } }).data.name;

test('the name of an event and of a partner, for someone who may view them', async (t) => {
  const checks = setup(t);
  const { GET } = await importRoute('names');
  assert.equal(await nameOf(await GET(get(`kind=event&id=${EVENT_ID}`))), 'MTK x Vasas');
  assert.equal(await nameOf(await GET(get(`kind=partner&id=${PARTNER_ID}`))), 'MTK Budapest');
  assert.deepEqual(checks, ['event:viewer', 'partner:viewer']);
});

test('someone without access learns nothing, not even the name', async (t) => {
  setup(t, { denied: true });
  const { GET } = await importRoute('denied');
  assert.equal((await GET(get(`kind=event&id=${EVENT_ID}`))).status, 403);
  assert.equal((await GET(get(`kind=partner&id=${PARTNER_ID}`))).status, 403);
});

test('a bad kind or id is refused, and an unknown event is not found', async (t) => {
  setup(t);
  const { GET } = await importRoute('bad');
  assert.equal((await GET(get(`kind=frame&id=${EVENT_ID}`))).status, 400);
  assert.equal((await GET(get('kind=event&id=nope'))).status, 400);
  assert.equal((await GET(get('kind=event'))).status, 400);
  assert.equal((await GET(get(`kind=event&id=${new ObjectId()}`))).status, 404);
});
