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

const frame = (frameId: string) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true });
const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, isActive: true, ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    frames: [frame('g1'), frame('g2')],
    logos: [logo('l1'), logo('l2'), logo('lp', { scope: 'partner', partnerId: 'P' })],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P', source: 'messmass', library: { frames: ['g1'], logos: ['l1'] }, defaultFrames: [] }],
    events: [],
  });
  const cascades: unknown[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => ADMIN, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/db/events', {
    namedExports: {
      updateChildEventsFromPartner: async (partnerId: string, updates: unknown) => {
        cascades.push({ partnerId, updates });
        return { brandColorsUpdated: 0, framesUpdated: 0, logosUpdated: 0 };
      },
    },
  });
  t.mock.module('@/lib/messmassClient', { namedExports: { pushPartnerToMessmass: async () => null } });
  return { ...seeded, cascades };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a default frame must be in the partner library: one that is not is refused and nothing is written', async (t) => {
  const { data, cascades } = setup(t);
  const { PATCH } = await importRoute('outside');
  const response = await PATCH(patch({ defaultFrames: ['g2'] }), params);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /partner library/);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, []);
  assert.deepEqual(cascades, []);
});

test('a default frame from the partner library is saved and follows into the events', async (t) => {
  const { data, cascades } = setup(t);
  const { PATCH } = await importRoute('inside');
  const response = await PATCH(patch({ defaultFrames: ['g1'] }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, ['g1']);
  assert.deepEqual(cascades, [{ partnerId: 'P', updates: { defaultFrames: ['g1'] } }]);
});

test('a default logo must be in the partner library: one that is not is refused and nothing is written', async (t) => {
  const { data, cascades } = setup(t);
  const { PATCH } = await importRoute('logo-outside');
  const response = await PATCH(patch({ defaultLogos: [{ logoId: 'l2', scenario: 'onboarding-thankyou', order: 0 }] }), params);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /partner library/);
  assert.equal((data.partners[0] as { defaultLogos?: unknown }).defaultLogos, undefined);
  assert.deepEqual(cascades, []);
});

test('default logos from the partner library are saved with their scenario and order and follow into the events', async (t) => {
  const { data, cascades } = setup(t);
  const { PATCH } = await importRoute('logo-inside');
  const defaultLogos = [{ logoId: 'l1', scenario: 'onboarding-thankyou', order: 0 }, { logoId: 'lp', scenario: 'loading-capture', order: 1 }];
  assert.equal((await PATCH(patch({ defaultLogos }), params)).status, 200);
  assert.deepEqual((data.partners[0] as { defaultLogos: unknown }).defaultLogos, defaultLogos);
  assert.deepEqual(cascades, [{ partnerId: 'P', updates: { defaultLogos } }]);
});

test('default logos need a logo and a known scenario each', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('logo-shape');
  assert.equal((await PATCH(patch({ defaultLogos: 'l1' }), params)).status, 400);
  assert.equal((await PATCH(patch({ defaultLogos: [{ logoId: 'l1' }] }), params)).status, 400);
  assert.equal((await PATCH(patch({ defaultLogos: [{ logoId: 'l1', scenario: 'somewhere' }] }), params)).status, 400);
  assert.equal((data.partners[0] as { defaultLogos?: unknown }).defaultLogos, undefined);
});

test('defaultFrames must be a list of ids; a change that does not touch it is not checked against the library', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('shape');
  assert.equal((await PATCH(patch({ defaultFrames: 'g1' }), params)).status, 400);
  assert.equal((await PATCH(patch({ defaultFrames: [1] }), params)).status, 400);
  assert.equal((await PATCH(patch({ description: ' A club ' }), params)).status, 200);
  assert.equal((data.partners[0] as { description: string }).description, 'A club');
});

test('the default language of the partner\'s events: set to a language we have, cleared with an empty value, refused otherwise, left alone when absent', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('language');
  assert.equal((await PATCH(patch({ uiLanguage: 'hu' }), params)).status, 200);
  assert.equal((data.partners[0] as { uiLanguage?: string | null }).uiLanguage, 'hu');
  assert.equal((await PATCH(patch({ name: 'Partner P' }), params)).status, 200);
  assert.equal((data.partners[0] as { uiLanguage?: string | null }).uiLanguage, 'hu', 'absent leaves it alone');
  assert.equal((await PATCH(patch({ uiLanguage: '' }), params)).status, 200);
  assert.equal((data.partners[0] as { uiLanguage?: string | null }).uiLanguage, null);
  for (const bad of ['de', 'HU', 7, {}]) assert.equal((await PATCH(patch({ uiLanguage: bad }), params)).status, 400, String(bad));
});
