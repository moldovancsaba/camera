import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, isActive: true, createdAt: `2026-10-0${logoId.length}T00:00:00.000Z`, ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    logos: [
      logo('g1'),
      logo('g2', { scope: 'global' }),
      logo('g3', { scope: null, isActive: false }),
      logo('p1', { scope: 'partner', partnerId: 'P', source: 'messmass' }),
      logo('e1', { scope: 'event', eventId: 'e-uuid' }),
    ],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => ADMIN } });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async () => ({ success: true, imageUrl: 'https://blob.example/logo.png', thumbnailUrl: 'https://blob.example/logo.png', deleteUrl: '', imageId: '', fileSize: 10, mimeType: 'image/png', fileName: 'logo.png', provider: 'blob', mirrorImageUrl: null }),
    },
  });
  return seeded;
}

const ids = async (response: Response) => ((await response.json()) as { data: { logos: Array<{ logoId: string }> } }).data.logos.map((l) => l.logoId).sort();

test('the global logo list holds the global logos only: a logo of one partner (the one from messmass too) or one event is not offered to everyone', async (t) => {
  setup(t);
  const { GET } = await importRoute('global-only');
  assert.deepEqual(await ids(await GET(new NextRequest('http://localhost/api/logos'))), ['g1', 'g2', 'g3']);
});

test('the active filter keeps working next to the scope', async (t) => {
  setup(t);
  const { GET } = await importRoute('active');
  assert.deepEqual(await ids(await GET(new NextRequest('http://localhost/api/logos?active=true'))), ['g1', 'g2']);
});

test('a logo uploaded by a global admin is written as a global library item', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('post');
  const form = new FormData();
  form.set('name', 'New shared logo');
  form.set('description', '');
  form.set('isActive', 'true');
  form.set('file', new File([new Uint8Array(await sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer())], 'logo.png', { type: 'image/png' }));
  const response = await POST(new NextRequest('http://localhost/api/logos', { method: 'POST', body: form }));
  assert.equal(response.status, 201);
  const stored = data.logos.find((l) => l.name === 'New shared logo') as Record<string, unknown>;
  assert.deepEqual([stored.scope, stored.width, stored.height, stored.isActive], ['global', 20, 10, true]);
});
