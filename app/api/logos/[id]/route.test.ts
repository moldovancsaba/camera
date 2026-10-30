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
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAdmin: async () => ADMIN } });
  return seeded;
}
const del = (id = String(LOGO_OID)) => [new NextRequest(`http://localhost/api/logos/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) }] as const;
const row = (logoId: string) => ({ logoId, scenario: 'onboarding-thankyou', order: 0, isActive: true });

test('a logo that nothing uses is deleted, and an unknown logo is not found', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete-unused');
  assert.equal((await DELETE(...del(String(new ObjectId())))).status, 404);
  assert.equal((await DELETE(...del())).status, 204);
  assert.equal(data.logos.length, 0);
});

test('a logo assigned to an event returns the exact event destination and remains in place', async (t) => {
  const { data } = setup(t, { events: [{ _id: new ObjectId(), eventId: 'e1', name: 'Event One', logos: [row('l1')] }] });
  const { DELETE } = await importRoute('delete-event');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string; details?: { total?: number; usages?: Array<{ ownerName: string; uses: string[]; href: string }> } };
  assert.match(body.error, /still used in 1 event/);
  assert.equal(body.details?.total, 1);
  assert.equal(body.details?.usages?.[0]?.ownerName, 'Event One');
  assert.deepEqual(body.details?.usages?.[0]?.uses, ['Assigned event logo']);
  assert.equal(body.details?.usages?.[0]?.href, `/admin/events/${(data.events[0]._id as ObjectId).toString()}/logos`);
  assert.equal(data.logos.length, 1);
  assert.equal((data.events[0].logos as unknown[]).length, 1, 'the event keeps its logo');
});

test('a logo that a partner library holds, or a partner makes a default, is not deleted either', async (t) => {
  const { data } = setup(t, { partners: [{ _id: new ObjectId(), partnerId: 'P', name: 'Partner P', defaultLogos: [row('l1')], library: { frames: [], logos: ['l1'] } }] });
  const { DELETE } = await importRoute('delete-partner');
  const response = await DELETE(...del());
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string; details?: { total?: number; usages?: Array<{ ownerName: string; uses: string[]; href: string }> } };
  assert.match(body.error, /still used in 1 partner/);
  assert.equal(body.details?.total, 1, 'the library membership and default are grouped at one destination');
  assert.deepEqual(body.details?.usages?.[0]?.uses, ['In the partner library · Default logo for new events']);
  assert.equal(data.logos.length, 1);
});
