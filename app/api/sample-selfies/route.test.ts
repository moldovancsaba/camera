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

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const seeded = fakeDb({
    images: [picture('s1', { tags: ['sample-selfie'] }), picture('s2', { tags: ['sample-selfie'], isActive: false }), picture('plain'), picture('sp', { tags: ['sample-selfie'], scope: 'partner', partnerId: 'P' })],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => { if (options.admin === false) throw apiReal.apiForbidden('Admin access required for this app'); return ADMIN; } } });
  t.mock.module('@/lib/imgbb/upload', { namedExports: { uploadImage: async (file: File) => ({ success: true, imageUrl: 'https://blob.example/selfie.png', thumbnailUrl: 'https://blob.example/selfie.png', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name }) } });
  return seeded;
}

const png = async () => new File([new Uint8Array(await sharp({ create: { width: 16, height: 9, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer())], 'selfie.png', { type: 'image/png' });
const post = (fields: Record<string, string>, file?: File) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('file', file);
  return new NextRequest('http://localhost/api/sample-selfies', { method: 'POST', body: form });
};

test('GET lists the global sample selfies, switched off ones included, never an untagged image or a partner’s upload', async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const response = await GET();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { items: Array<{ id: string; itemActive: boolean }> } };
  assert.deepEqual(body.data.items.map((i) => i.id).sort(), ['s1', 's2']);
  assert.equal(body.data.items.find((i) => i.id === 's2')?.itemActive, false);
});

test('POST uploads a global sample selfie carrying the tag, with no consent field asked for (owner answer 256)', async (t) => {
  const w = setup(t);
  const { POST } = await importRoute('post');
  const response = await POST(post({ name: 'Fan at the match' }, await png()));
  assert.equal(response.status, 201);
  const saved = w.data.images.find((doc) => doc.name === 'Fan at the match')!;
  assert.deepEqual(saved.tags, ['sample-selfie']);
  assert.equal(saved.scope, 'global');
  assert.equal((await POST(post({ name: '' }, await png()))).status, 400, 'a name is required');
  assert.equal((await POST(post({ name: 'No file' }))).status, 400, 'a file is required');
});

test('only global admins can list or upload', async (t) => {
  setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(post({ name: 'x' }, await png()))).status, 403);
});
