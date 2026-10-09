import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'MTK x Vasas', uiLanguage: 'hu' }],
    partners: [{ partnerId: 'P', name: 'MTK', emailLegal: { hu: 'MTK feltételek' } }],
    admin_settings: [{ settingId: 'email-legal', legal: { hu: 'Általános', en: 'General' } }],
  });
  const roles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      getPartnerScopedAccessForEvent: async (_db: unknown, _id: string, _s: unknown, role: string) => {
        roles.push(role);
        return { allowed: options.allowed ?? true, role: 'admin', partnerId: 'P' };
      },
    },
  });
  return { ...seeded, roles };
}
const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const url = `http://localhost/api/events/${EVENT_MONGO_ID}/email-legal`;
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
type Answer = { data: { language: string; legal: unknown; inherited: { global: unknown; partner: unknown }; effective: { text: string; source: string } | null } };

test('GET gives the event’s language, its own legal part, what it takes from above and what applies, with its source', async (t) => {
  const { roles } = setup(t);
  const { GET } = await importRoute('get');
  const { data } = (await (await GET(new NextRequest(url), params)).json()) as Answer;
  assert.equal(data.language, 'hu');
  assert.deepEqual(data.legal, {});
  assert.deepEqual(data.inherited.partner, { hu: 'MTK feltételek' });
  assert.deepEqual(data.inherited.global, { hu: 'Általános', en: 'General' });
  assert.deepEqual(data.effective, { text: 'MTK feltételek', source: 'partner' }, 'the event follows its partner');
  assert.deepEqual(roles, ['viewer']);
});

test('PUT sets the event’s own legal part (manager), which then wins; a bad one is refused and nothing changes', async (t) => {
  const { data, roles } = setup(t);
  const { GET, PUT } = await importRoute('put');
  assert.equal((await PUT(put({ legal: { hu: 'Meccs feltételek' } }), params)).status, 200);
  assert.deepEqual((data.events[0] as { emailLegal: unknown }).emailLegal, { hu: 'Meccs feltételek' });
  assert.deepEqual(roles, ['manager']);
  assert.equal((await PUT(put({ legal: 'x' }), params)).status, 400);
  assert.deepEqual((data.events[0] as { emailLegal: unknown }).emailLegal, { hu: 'Meccs feltételek' });
  const { data: after } = (await (await GET(new NextRequest(url), params)).json()) as Answer;
  assert.deepEqual(after.effective, { text: 'Meccs feltételek', source: 'event' });
});

test('without access nothing is read or written', async (t) => {
  const { data } = setup(t, { allowed: false });
  const { GET, PUT } = await importRoute('denied');
  assert.equal((await GET(new NextRequest(url), params)).status, 403);
  assert.equal((await PUT(put({ legal: { hu: 'x' } }), params)).status, 403);
  assert.equal('emailLegal' in (data.events[0] as object), false);
});
