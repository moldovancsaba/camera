import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const picture = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Picture ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, isActive: true, ...extra });

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const seeded = fakeDb({
    images: [picture('g1'), picture('g2'), picture('p1', { scope: 'partner', partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: [], images: ['g1', 'g2'] } }, { partnerId: 'Q', name: 'Partner Q' }],
    events: [{ eventId: 'E', partnerId: 'P', emailFooterImageUrl: 'https://img.example/g1.png' }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      requireAdmin: async () => {
        if (options.admin === false) throw apiReal.apiForbidden('Admin access required for this app');
        return ADMIN;
      },
    },
  });
  return seeded;
}

const ctx = (pictureId: string) => ({ params: Promise.resolve({ pictureId }) });
const patch = (pictureId: string, body: unknown) =>
  [new NextRequest(`http://localhost/api/images/${pictureId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(pictureId)] as const;
const del = (pictureId: string) => [new NextRequest(`http://localhost/api/images/${pictureId}`, { method: 'DELETE' }), ctx(pictureId)] as const;

test('PATCH switches a global image off and on', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('switch');
  const off = await PATCH(...patch('g1', { isActive: false }));
  assert.equal(off.status, 200);
  assert.equal(((await off.json()) as { data: { item: { itemActive: boolean } } }).data.item.itemActive, false);
  assert.equal((data.images[0] as { isActive: boolean }).isActive, false);
  assert.equal((await PATCH(...patch('g1', { isActive: true }))).status, 200);
  assert.equal((data.images[0] as { isActive: boolean }).isActive, true);
});

test('PATCH needs true or false, a global image, and an image that exists', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('switch-bad');
  assert.equal((await PATCH(...patch('g1', { isActive: 'no' }))).status, 400);
  assert.equal((await PATCH(...patch('g1', {}))).status, 400);
  const partnerUpload = await PATCH(...patch('p1', { isActive: false }));
  assert.equal(partnerUpload.status, 400);
  assert.match(((await partnerUpload.json()) as { error: string }).error, /Images page of that partner/);
  assert.equal((await PATCH(...patch('nope', { isActive: false }))).status, 404);
  assert.equal(data.images.every((i) => i.isActive === true), true);
});

test('DELETE removes a global image from the library and from the partner libraries; the event field keeps its address', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete');
  const response = await DELETE(...del('g1'));
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { data: unknown }).data, { deleted: 'g1', partnersUpdated: 1 });
  assert.deepEqual(data.images.map((i) => i.pictureId), ['g2', 'p1']);
  assert.deepEqual((data.partners[0] as { library: { images: string[] } }).library.images, ['g2']);
  assert.equal((data.events[0] as { emailFooterImageUrl: string }).emailFooterImageUrl, 'https://img.example/g1.png');
});

test('a user who is not a global admin can neither switch nor delete a global image', async (t) => {
  const { data } = setup(t, { admin: false });
  const { DELETE, PATCH } = await importRoute('forbidden');
  assert.equal((await DELETE(...del('g1'))).status, 403);
  assert.equal((await PATCH(...patch('g1', { isActive: false }))).status, 403);
  assert.equal(data.images.length, 3);
});

test('DELETE refuses the upload of a partner, and an image that does not exist', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('delete-refused');
  assert.equal((await DELETE(...del('p1'))).status, 400);
  assert.equal((await DELETE(...del('nope'))).status, 404);
  assert.equal(data.images.length, 3);
});
