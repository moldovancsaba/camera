import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// The partner upload route with kind=images (camera#368).
const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

// One list for the file: the library upload module is loaded once, with the file store of the first test that loads it.
const stored: string[] = [];

function setup(t: TestContext) {
  const seeded = fakeDb({ images: [], partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P' }] });
  stored.length = 0;
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: { assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => ({ partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' }) },
  });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async (file: File) => {
        stored.push(file.name);
        return { success: true, imageUrl: 'https://blob.example/club.webp', thumbnailUrl: 'https://blob.example/club.webp', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name, provider: 'blob', mirrorImageUrl: null };
      },
    },
  });
  return seeded;
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
function post(fields: Record<string, string>, file: File): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set('file', file);
  return new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/upload`, { method: 'POST', body: form });
}

test("an image uploaded for a partner is the partner's own picture, in its library at once", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('ok');
  const response = await POST(post({ kind: 'images', name: 'Club colours' }, new File([new Uint8Array([1, 2, 3])], 'club.webp', { type: 'image/webp' })), params);
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { item: { id: string; kind: string; scope: string; imageUrl: string } } };
  assert.deepEqual([body.data.item.kind, body.data.item.scope, body.data.item.imageUrl], ['images', 'partner', 'https://blob.example/club.webp']);
  assert.deepEqual(stored, ['club.webp']);
  const doc = data.images[0] as Record<string, unknown>;
  assert.deepEqual([doc.pictureId, doc.scope, doc.partnerId, doc.eventId], [body.data.item.id, 'partner', 'P', undefined]);
});

test('an image of more than 4 MB is refused with a plain message before it is stored', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('big');
  const response = await POST(post({ kind: 'images', name: 'Huge' }, new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' })), params);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /too big: 4 MB at most/);
  assert.deepEqual(stored, []);
  assert.equal(data.images.length, 0);
});
