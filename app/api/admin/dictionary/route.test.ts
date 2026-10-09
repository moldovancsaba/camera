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
const url = 'http://localhost/api/admin/dictionary';
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a global admin writes the global wordings and reads them back; an empty text takes one away', async (t) => {
  const { data } = setup(t, ADMIN);
  const { GET, PUT } = await importRoute('write');
  const saved = await PUT(put({ texts: { en: { 'welcome.button': 'Kick off', 'camera.takePhoto': '' } } }));
  assert.equal(saved.status, 200);
  assert.deepEqual(((await saved.json()) as { data: unknown }).data, { texts: { en: { 'welcome.button': 'Kick off' } } });
  assert.equal(data.admin_settings.length, 1);
  const read = (await (await GET(new NextRequest(url))).json()) as { data: { texts: unknown } };
  assert.deepEqual(read.data.texts, { en: { 'welcome.button': 'Kick off' } });
});

test('what the rules refuse is refused with the reason and nothing is stored: markup, an unknown key, a changed marker, no body', async (t) => {
  const { data } = setup(t, ADMIN);
  const { PUT } = await importRoute('refuse');
  assert.equal((await PUT(put({ texts: { en: { 'welcome.button': '<b>x</b>' } } }))).status, 400);
  assert.equal((await PUT(put({ texts: { en: { 'no.such': 'x' } } }))).status, 400);
  assert.equal((await PUT(put({ texts: 'x' }))).status, 400);
  assert.equal((await PUT(new NextRequest(url, { method: 'PUT', body: 'nope' }))).status, 400);
  assert.equal(data.admin_settings.length, 0);
});

test('only a global admin: someone else cannot read or write the global wordings', async (t) => {
  const { data } = setup(t, PARTNER_USER);
  const { GET, PUT } = await importRoute('forbidden');
  assert.equal((await GET(new NextRequest(url))).status, 403);
  assert.equal((await PUT(put({ texts: { en: { 'welcome.button': 'x' } } }))).status, 403);
  assert.equal(data.admin_settings.length, 0);
});
