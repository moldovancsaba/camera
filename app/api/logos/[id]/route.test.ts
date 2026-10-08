import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const LOGO_OID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, extra: { events?: Array<Record<string, unknown>>; partners?: Array<Record<string, unknown>> } = {}) {
  const seeded = fakeDb({ logos: [{ _id: LOGO_OID, logoId: 'l1', name: 'Logo', isActive: true }], events: extra.events ?? [], partners: extra.partners ?? [] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => ADMIN } });
  return seeded;
}
const del = (id = String(LOGO_OID)) => [new NextRequest(`http://localhost/api/logos/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) }] as const;
const errorOf = async (response: Response) => ((await response.json()) as { error?: string }).error ?? '';
const row = (logoId: string) => ({ logoId, scenario: 'onboarding-thankyou', order: 0, isActive: true });

test('a logo that nothing uses is deleted, and an unknown logo is not found', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete-unused');
  assert.equal((await DELETE(...del(String(new ObjectId())))).status, 404);
  assert.equal((await DELETE(...del())).status, 204);
  assert.equal(data.logos.length, 0);
});

test('a logo that an event has is not deleted any more, and not pulled from the event: the answer says how many events', async (t) => {
  const { data } = setup(t, { events: [{ eventId: 'e1', logos: [row('l1')] }] });
  const { DELETE } = await importRoute('delete-event');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  assert.match(await errorOf(response), /used by 1 event\. Switch it off instead/);
  assert.equal(data.logos.length, 1);
  assert.equal((data.events[0].logos as unknown[]).length, 1, 'the event keeps its logo');
});

test('a logo that a partner library holds, or a partner makes a default, is not deleted either', async (t) => {
  const { data } = setup(t, { partners: [{ partnerId: 'P', defaultLogos: [row('l1')], library: { frames: [], logos: ['l1'] } }] });
  const { DELETE } = await importRoute('delete-partner');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  assert.match(await errorOf(response), /1 partner library, 1 partner that makes it a default for new events/);
  assert.equal(data.logos.length, 1);
});
