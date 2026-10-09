import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const authReal = await import('@/lib/partners/authorization');
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const PARTNER_USER = { appRole: 'none', user: { id: 'p1', email: 'p@example.com', name: 'P' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, session: typeof ADMIN) {
  const seeded = fakeDb({ admin_settings: [] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { ...authReal } });
  return seeded;
}
const url = 'http://localhost/api/admin/emails/legal';
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a global admin writes the general legal part and reads it back; an empty text takes a language away', async (t) => {
  const { data } = setup(t, ADMIN);
  const { GET, PUT } = await importRoute('write');
  const saved = await PUT(put({ legal: { en: 'Terms: {terms}', hu: '' } }));
  assert.equal(saved.status, 200);
  assert.deepEqual(((await saved.json()) as { data: unknown }).data, { legal: { en: 'Terms: {terms}' } });
  assert.equal(data.admin_settings.length, 1);
  assert.deepEqual(((await (await GET(new NextRequest(url))).json()) as { data: unknown }).data, { legal: { en: 'Terms: {terms}' } });
});

test('what the rules refuse is refused with the reason and nothing is stored', async (t) => {
  const { data } = setup(t, ADMIN);
  const { PUT } = await importRoute('refuse');
  assert.equal((await PUT(put({ legal: { de: 'x' } }))).status, 400);
  assert.equal((await PUT(put({ legal: 'x' }))).status, 400);
  assert.equal((await PUT(new NextRequest(url, { method: 'PUT', body: 'nope' }))).status, 400);
  assert.equal(data.admin_settings.length, 0);
});

test('only a global admin: someone else cannot read or write the general legal part', async (t) => {
  const { data } = setup(t, PARTNER_USER);
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url))).status, 403);
  assert.equal((await PUT(put({ legal: { en: 'x' } }))).status, 403);
  assert.equal(data.admin_settings.length, 0);
});
