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

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({ frames: [], partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P' }] });
  const stored: unknown[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db) => {
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level manager access is required');
        return { partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' };
      },
    },
  });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async (file: File) => {
        stored.push(file.name);
        return { success: true, imageUrl: 'https://blob.example/frame.png', thumbnailUrl: 'https://blob.example/frame.png', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name, provider: 'blob', mirrorImageUrl: null };
      },
    },
  });
  return { ...seeded, stored };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
function post(fields: Record<string, string>, file?: File): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('file', file);
  return new NextRequest(`http://localhost/api/partners/${PARTNER_MONGO_ID}/library/upload`, { method: 'POST', body: form });
}
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'blue.png', { type: 'image/png' });

test('an upload for a partner is stored as the partner\'s own frame, in its library at once', async (t) => {
  const { data, stored } = setup(t);
  const { POST } = await importRoute('ok');
  const response = await POST(post({ kind: 'frames', name: '  Blue match frame ' }, png()), params);
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { item: { id: string; name: string; scope: string; imageUrl: string } } };
  assert.equal(body.data.item.scope, 'partner');
  assert.equal(body.data.item.name, 'Blue match frame');
  assert.equal(body.data.item.imageUrl, 'https://blob.example/frame.png');
  assert.deepEqual(stored, ['blue.png']);
  const doc = data.frames[0] as Record<string, unknown>;
  assert.equal(doc.scope, 'partner');
  assert.equal(doc.partnerId, 'P');
  assert.equal(doc.eventId, undefined);
  assert.equal(doc.isActive, true);
  assert.equal(doc.createdBy, 'a1');
});

test('a bad upload never reaches the file store: not an image, no name, no file, a kind that is not available', async (t) => {
  const { data, stored } = setup(t);
  const { POST } = await importRoute('bad');
  const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, pdf), params)).status, 400);
  assert.equal((await POST(post({ kind: 'frames', name: '  ' }, png()), params)).status, 400);
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }), params)).status, 400);
  assert.equal((await POST(post({ kind: 'logos', name: 'x' }, png()), params)).status, 400);
  assert.equal((await POST(post({ kind: 'nope', name: 'x' }, png()), params)).status, 400);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
});

test('a user without manager access to the partner cannot upload for it', async (t) => {
  const { data, stored } = setup(t, { allowed: false });
  const { POST } = await importRoute('forbidden');
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, png()), params)).status, 403);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
});
