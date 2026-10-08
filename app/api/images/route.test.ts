import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const picture = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Picture ${pictureId}`, imageUrl: `https://img.example/${pictureId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

// One list for the file: the library upload module is loaded once, with the file store of the first test that loads it.
const stored: string[] = [];

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const seeded = fakeDb({
    images: [picture('g1'), picture('g2', { scope: 'global', isActive: false }), picture('p1', { scope: 'partner', partnerId: 'P' }), picture('e1', { scope: 'event', eventId: 'E' })],
    partners: [{ partnerId: 'P', name: 'MTK Budapest' }],
    events: [{ eventId: 'E', name: 'MTK x Vasas' }],
  });
  stored.length = 0;
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
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async (file: File) => {
        stored.push(file.name);
        return { success: true, imageUrl: 'https://blob.example/global.png', thumbnailUrl: 'https://blob.example/global.png', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name, provider: 'blob', mirrorImageUrl: null };
      },
    },
  });
  return { ...seeded };
}

const get = (query = '') => new NextRequest(`http://localhost/api/images${query}`);
function post(fields: Record<string, string>, file?: File): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('file', file);
  return new NextRequest('http://localhost/api/images', { method: 'POST', body: form });
}
const png = async () => new File([new Uint8Array(await sharp({ create: { width: 16, height: 9, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer())], 'pitch.png', { type: 'image/png' });
interface ListBody { data: { items: Array<{ id: string; scope: string; itemActive: boolean; owner: { level: string; name: string } | null }> } }
const ids = (body: ListBody) => body.data.items.map((i) => i.id).sort();

test('GET lists the global images only, switched-off ones included, never what a partner or an event uploaded for itself', async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET(get());
  assert.equal(response.status, 200);
  const body = (await response.json()) as ListBody;
  assert.deepEqual(ids(body), ['g1', 'g2']);
  assert.equal(body.data.items.find((i) => i.id === 'g2')?.itemActive, false);
});

test('GET with scope=all lists every upload, each with whose upload it is', async (t) => {
  setup(t);
  const { GET } = await importRoute('get-all');
  const body = (await (await GET(get('?scope=all'))).json()) as ListBody;
  assert.deepEqual(ids(body), ['e1', 'g1', 'g2', 'p1']);
  assert.deepEqual(body.data.items.find((i) => i.id === 'p1')?.owner, { level: 'partner', name: 'MTK Budapest' });
  assert.deepEqual(body.data.items.find((i) => i.id === 'e1')?.owner, { level: 'event', name: 'MTK x Vasas' });
});

test('POST stores an upload in the global library, active, with its size in pixels', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('post');
  const response = await POST(post({ name: '  Stadium at night ' }, await png()));
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { item: { id: string; name: string; scope: string; imageUrl: string } } };
  assert.deepEqual([body.data.item.name, body.data.item.scope, body.data.item.imageUrl], ['Stadium at night', 'global', 'https://blob.example/global.png']);
  assert.deepEqual(stored, ['pitch.png']);
  const doc = data.images.at(-1) as Record<string, unknown>;
  assert.deepEqual([doc.scope, doc.width, doc.height, doc.isActive, doc.createdBy, doc.partnerId, doc.eventId], ['global', 16, 9, true, 'a1', undefined, undefined]);
});

test('POST refuses a bad upload before the file store: no name, no file, not a picture', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('post-bad');
  assert.equal((await POST(post({ name: ' ' }, await png()))).status, 400);
  assert.equal((await POST(post({ name: 'x' }))).status, 400);
  assert.equal((await POST(post({ name: 'x' }, new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })))).status, 400);
  assert.deepEqual(stored, []);
  assert.equal(data.images.length, 4);
});

test('only a global admin lists or uploads global images', async (t) => {
  const { data } = setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  assert.equal((await GET(get())).status, 403);
  assert.equal((await POST(post({ name: 'x' }, await png()))).status, 403);
  assert.deepEqual(stored, []);
  assert.equal(data.images.length, 4);
});
