import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';
import { resetJourneySettingCache } from '@/lib/journey/setting';

const apiReal = await import('@/lib/api');

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/admin/settings/journey-recording', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });

function setup(t: TestContext, role: 'admin' | 'user') {
  resetJourneySettingCache();
  const seeded = fakeDb();
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ({ user: { id: 'a1', email: 'owner@example.test' }, appRole: role }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', { exports: { isGlobalAdminSession: () => role === 'admin' } });
  return seeded;
}

test('only a global admin may read or change the kill switch', async (t) => {
  const w = setup(t, 'user');
  const { GET, PATCH } = await load('forbidden');
  assert.equal((await GET(req('GET'))).status, 403);
  assert.equal((await PATCH(req('PATCH', { enabled: false }))).status, 403);
  assert.equal((w.data.admin_settings ?? []).length, 0);
});

test('the recording is on until it is switched off; a global admin switches it off and on, and the change says who and when', async (t) => {
  const w = setup(t, 'admin');
  const { GET, PATCH } = await load('switch');
  const first = (await (await GET(req('GET'))).json()) as { data: { enabled: boolean; updatedBy: string | null } };
  assert.equal(first.data.enabled, true);
  assert.equal(first.data.updatedBy, null);

  const off = await PATCH(req('PATCH', { enabled: false }));
  assert.equal(off.status, 200);
  assert.equal(((await off.json()) as { data: { enabled: boolean } }).data.enabled, false);
  assert.equal(w.data.admin_settings.length, 1);
  assert.equal(w.data.admin_settings[0].updatedBy, 'owner@example.test');
  assert.equal(((await (await GET(req('GET'))).json()) as { data: { enabled: boolean } }).data.enabled, false);

  assert.equal((await PATCH(req('PATCH', { enabled: true }))).status, 200);
  assert.equal(((await (await GET(req('GET'))).json()) as { data: { enabled: boolean } }).data.enabled, true);
  assert.equal(w.data.admin_settings.length, 1, 'one document');
});

test('the value must be true or false: text, a number or nothing is refused and nothing is stored', async (t) => {
  const w = setup(t, 'admin');
  const { PATCH } = await load('bad');
  for (const body of [{ enabled: 'false' }, { enabled: 0 }, {}, null]) assert.equal((await PATCH(req('PATCH', body))).status, 400, JSON.stringify(body));
  assert.equal((w.data.admin_settings ?? []).length, 0);
});
