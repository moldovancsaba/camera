import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const ADMIN_A = { appRole: 'admin', user: { id: 'sso-a', email: 'a@example.com', name: 'Admin A' } };
const ADMIN_B = { appRole: 'admin', user: { id: 'sso-b', email: 'b@example.com', name: 'Admin B' } };
type RouteModule = typeof import('./route');

function setup(t: TestContext) {
  const seeded = fakeDb();
  const state: { session: unknown; rateLimits: unknown[] } = { session: ADMIN_A, rateLimits: [] };
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', {
    exports: {
      ...apiReal,
      requireAuth: async () => {
        if (!state.session) throw apiReal.apiUnauthorized();
        return state.session;
      },
      checkRateLimit: async (_request: unknown, config: unknown) => { state.rateLimits.push(config); },
    },
  });
  return { ...seeded, state };
}

const url = 'http://localhost/api/account/preferences';
const get = (language = 'en') => new NextRequest(url, { headers: { 'accept-language': language } });
const patch = (body: unknown, language = 'en') => new NextRequest(url, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', 'accept-language': language },
  body: JSON.stringify(body),
});
const dataOf = async (response: Response) => (await response.json()) as { data?: Record<string, unknown>; error?: string };
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

test('GET/PATCH are per authenticated SSO user and return the current device fallback', async (t) => {
  const { state, data } = setup(t);
  const { GET, PATCH } = await importRoute('ownership');

  const initial = await dataOf(await GET(get('fr-FR,hu;q=0.8')));
  assert.equal(initial.data?.uiLanguage, null);
  assert.equal(initial.data?.deviceLanguage, 'fr');
  assert.equal((await GET(get())).headers.get('cache-control'), 'private, no-store');

  assert.equal((await PATCH(patch({ uiLanguage: 'hu' }, 'de'))).status, 200);
  const saved = await dataOf(await GET(get('de')));
  assert.equal(saved.data?.uiLanguage, 'hu');
  assert.equal(saved.data?.deviceLanguage, 'de');

  state.session = ADMIN_B;
  const otherUser = await dataOf(await GET(get('en')));
  assert.equal(otherUser.data?.uiLanguage, null);
  assert.equal((await PATCH(patch({ uiLanguage: 'fr', userId: 'sso-a' }))).status, 400);

  state.session = ADMIN_A;
  const stillOwned = await dataOf(await GET(get()));
  assert.equal(stillOwned.data?.uiLanguage, 'hu');
  assert.ok(data.admin_user_preferences.some((row) => row._id === 'sso-a'));
  assert.equal(data.admin_user_preferences.some((row) => row._id === 'sso-b'), false);
});

test('reject unauthenticated users and unsupported locale values', async (t) => {
  const { state } = setup(t);
  const { GET, PATCH } = await importRoute('validation');
  state.session = null;
  assert.equal((await GET(get())).status, 401);
  assert.equal((await PATCH(patch({ uiLanguage: 'xx' }))).status, 401);

  state.session = ADMIN_A;
  assert.equal((await PATCH(patch({ uiLanguage: 'xx' }))).status, 400);
  assert.equal((await PATCH(patch({ uiLanguage: 'hu', profile: { name: 'x' } }))).status, 400);
  assert.equal((await PATCH(patch({ uiLanguage: null }))).status, 200);
});

test('workspace users can save their own preference while sessions without Camera access are refused', async (t) => {
  const { state, db } = setup(t);
  const { GET, PATCH } = await importRoute('workspace-access');
  state.session = { appRole: 'user', appAccess: true, user: { id: 'partner-reviewer', email: 'reviewer@example.com', name: 'Reviewer' } };
  await db.collection('partner_user_access').insertOne({
    accessId: 'reviewer-mtk',
    partnerId: 'mtk',
    partnerName: 'MTK',
    userId: 'partner-reviewer',
    userEmail: 'reviewer@example.com',
    appKey: 'events',
    role: 'manager',
    isActive: true,
  });
  assert.equal((await PATCH(patch({ uiLanguage: 'hu' }))).status, 200);
  assert.equal((await dataOf(await GET(get()))).data?.uiLanguage, 'hu');

  state.session = { appRole: 'user', appAccess: false, user: { id: 'blocked', email: 'blocked@example.com' } };
  assert.equal((await GET(get())).status, 403);
});
