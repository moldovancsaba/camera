import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';
import { COUNTERS_SETTING_ID } from '@/lib/analytics/counters-setting';

const apiReal = await import('@/lib/api');

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/admin/settings/messmass-counters', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) });

function setup(t: TestContext, role: 'admin' | 'user') {
  const seeded = fakeDb();
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ({ user: { id: 'a1', email: 'owner@example.test' }, appRole: role }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', { exports: { isGlobalAdminSession: () => role === 'admin' } });
  return seeded;
}

type Answer = { data: { enabled: boolean; updatedAt: string; updatedBy: string | null } };

test('only a global admin may read or change the switch, and a refusal writes nothing', async (t) => {
  const w = setup(t, 'user');
  const { GET, PATCH } = await load('forbidden');
  assert.equal((await GET(req('GET'))).status, 403);
  assert.equal((await PATCH(req('PATCH', { enabled: true }))).status, 403);
  assert.equal((w.data.admin_settings ?? []).length, 0);
});

test('the push is off until it is switched on; a global admin switches it on and off, and the change says who and when', async (t) => {
  const w = setup(t, 'admin');
  const { GET, PATCH } = await load('switch');
  const first = (await (await GET(req('GET'))).json()) as Answer;
  assert.equal(first.data.enabled, false);
  assert.equal(first.data.updatedBy, null);

  const on = await PATCH(req('PATCH', { enabled: true }));
  assert.equal(on.status, 200);
  assert.equal(((await on.json()) as Answer).data.enabled, true);
  assert.equal(w.data.admin_settings.length, 1);
  assert.equal(w.data.admin_settings[0].settingId, COUNTERS_SETTING_ID);
  assert.equal(w.data.admin_settings[0].updatedBy, 'owner@example.test');
  assert.equal(((await (await GET(req('GET'))).json()) as Answer).data.enabled, true);

  assert.equal((await PATCH(req('PATCH', { enabled: false }))).status, 200);
  assert.equal(((await (await GET(req('GET'))).json()) as Answer).data.enabled, false);
  assert.equal(w.data.admin_settings.length, 1, 'one document, changed in place');
});

test('anything but a true or false is refused and nothing is written', async (t) => {
  const w = setup(t, 'admin');
  const { PATCH } = await load('bad');
  for (const body of [{}, { enabled: 'true' }, { enabled: 1 }, { enabled: null }, 'x', null]) {
    assert.equal((await PATCH(req('PATCH', body))).status, 400, JSON.stringify(body));
  }
  assert.equal((w.data.admin_settings ?? []).length, 0);
});
