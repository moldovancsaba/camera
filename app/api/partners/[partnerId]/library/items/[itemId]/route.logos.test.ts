import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    logos: [
      { logoId: 'lp1', name: 'Own logo', isActive: true, scope: 'partner', partnerId: 'P' },
      { logoId: 'lp2', name: 'Logo from messmass', isActive: true, scope: 'partner', partnerId: 'P', source: 'messmass' },
      { logoId: 'lg1', name: 'Global', isActive: true },
    ],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', defaultLogos: [{ logoId: 'lp1', scenario: 'loading-capture', order: 0 }, { logoId: 'lg1', scenario: 'onboarding-thankyou', order: 1 }] }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', logos: [{ logoId: 'lp2', scenario: 'onboarding-thankyou', order: 0, isActive: true }] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }),
    },
  });
  return seeded;
}

const del = (itemId: string) => [
  new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/items/${itemId}?kind=logos`, { method: 'DELETE' }),
  { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID), itemId }) },
] as const;

test("deleting a partner's own logo removes it and its rows of the defaults", async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('own');
  assert.equal((await DELETE(...del('lp1'))).status, 200);
  assert.deepEqual(data.logos.map((l) => l.logoId).sort(), ['lg1', 'lp2']);
  assert.deepEqual((data.partners[0] as { defaultLogos: Array<{ logoId: string }> }).defaultLogos.map((r) => r.logoId), ['lg1']);
});

test('a logo one of its events uses cannot be deleted (409), nor a global logo here (400)', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('refuse');
  assert.equal((await DELETE(...del('lp2'))).status, 409, 'the messmass logo is assigned to an event');
  assert.equal((await DELETE(...del('lg1'))).status, 400);
  assert.equal((await DELETE(...del('nope'))).status, 404);
  assert.equal(data.logos.length, 3);
});
