import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const row = (logoId: string, scenario: string, order: number, isActive = true) => ({ logoId, scenario, order, isActive, addedAt: '2026-10-01T00:00:00.000Z', addedBy: 'system' });

// The defaults give most events the same logo in all four scenarios (every event with logos had that on 2026-10-08).
function setup(t: TestContext) {
  const seeded = fakeDb({
    logos: [{ logoId: 'l1', name: 'Club logo', imageUrl: 'https://img.example/l1.png', isActive: true }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', logos: [row('l1', 'slideshow-transition', 0), row('l1', 'onboarding-thankyou', 1), row('l1', 'loading-slideshow', 2), row('l1', 'loading-capture', 3)] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID), logoId: 'l1' }) };
const url = (query = '') => `http://localhost/api/events/${EVENT_MONGO_ID}/logos/l1${query}`;
const patch = (body: Record<string, unknown>) => new NextRequest(url(), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const state = (data: Record<string, Array<Record<string, unknown>>>) => (data.events[0].logos as Array<{ scenario: string; isActive: boolean; order: number }>).map((r) => [r.scenario, r.isActive, r.order]);

test('switching a logo off in one scenario changes that scenario only, and the event now has its own logo list', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('toggle-scenario');
  const response = await PATCH(patch({ action: 'toggle', scenario: 'loading-capture' }), params);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { data: { isActive: boolean } }).data.isActive, false);
  assert.deepEqual(state(data), [['slideshow-transition', true, 0], ['onboarding-thankyou', true, 1], ['loading-slideshow', true, 2], ['loading-capture', false, 3]]);
  assert.equal(data.events[0].logosOverridden, true);
});

test('without a scenario the toggle changes the first assignment, as before, and also marks the list as its own', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('toggle-first');
  assert.equal((await PATCH(patch({ action: 'toggle' }), params)).status, 200);
  assert.deepEqual(state(data).map((r) => r[1]), [false, true, true, true]);
  assert.equal(data.events[0].logosOverridden, true);
});

test('the order of one scenario can be changed', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('order');
  assert.equal((await PATCH(patch({ action: 'updateOrder', order: 7, scenario: 'onboarding-thankyou' }), params)).status, 200);
  assert.deepEqual(state(data).map((r) => r[2]), [0, 7, 2, 3]);
  assert.equal(data.events[0].logosOverridden, true);
});

test('removing a logo from one scenario keeps it in the others, and the event now has its own logo list', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('remove-scenario');
  const response = await DELETE(new NextRequest(url('?scenario=onboarding-thankyou'), { method: 'DELETE' }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(state(data).map((r) => r[0]), ['slideshow-transition', 'loading-slideshow', 'loading-capture']);
  assert.equal(data.events[0].logosOverridden, true);
});

test('without a scenario the logo is removed from the event, as before', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('remove-all');
  assert.equal((await DELETE(new NextRequest(url(), { method: 'DELETE' }), params)).status, 200);
  assert.deepEqual(state(data), []);
  assert.equal(data.events[0].logosOverridden, true);
});

test('an unknown scenario, or a scenario the logo is not in, changes nothing', async (t) => {
  const { data } = setup(t);
  const { DELETE, PATCH } = await importRoute('refuse');
  assert.equal((await DELETE(new NextRequest(url('?scenario=everywhere'), { method: 'DELETE' }), params)).status, 400);
  assert.equal((await PATCH(patch({ action: 'toggle', scenario: 'everywhere' }), params)).status, 400);
  await DELETE(new NextRequest(url('?scenario=loading-capture'), { method: 'DELETE' }), params);
  assert.equal((await DELETE(new NextRequest(url('?scenario=loading-capture'), { method: 'DELETE' }), params)).status, 404);
  assert.equal((await PATCH(patch({ action: 'toggle', scenario: 'loading-capture' }), params)).status, 404);
  assert.deepEqual(state(data), [['slideshow-transition', true, 0], ['onboarding-thankyou', true, 1], ['loading-slideshow', true, 2]]);
});
