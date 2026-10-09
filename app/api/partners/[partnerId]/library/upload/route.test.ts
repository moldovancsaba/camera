import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({ frames: [], logos: [], partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'Partner P' }] });
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

test('a bad upload never reaches the file store: not an image, no name, no file, a file the kind does not take, an unknown kind', async (t) => {
  const { data, stored } = setup(t);
  const { POST } = await importRoute('bad');
  const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
  const gif = new File([new Uint8Array([71, 73, 70])], 'x.gif', { type: 'image/gif' });
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, pdf), params)).status, 400);
  assert.equal((await POST(post({ kind: 'frames', name: '  ' }, png()), params)).status, 400);
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }), params)).status, 400);
  assert.equal((await POST(post({ kind: 'logos', name: 'x' }, gif), params)).status, 400);
  assert.equal((await POST(post({ kind: 'nope', name: 'x' }, png()), params)).status, 400);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
  assert.equal((data.logos ?? []).length, 0);
});

test("a logo uploaded for a partner is the partner's own logo, in its library at once, stored like a global logo upload and measured", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('logo');
  const picture = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const response = await POST(post({ kind: 'logos', name: 'Club crest' }, new File([new Uint8Array(picture)], 'crest.png', { type: 'image/png' })), params);
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { item: { kind: string; scope: string; name: string } } };
  assert.deepEqual([body.data.item.kind, body.data.item.scope, body.data.item.name], ['logos', 'partner', 'Club crest']);
  const logo = data.logos[0] as Record<string, unknown>;
  assert.equal(typeof logo.logoId, 'string');
  assert.deepEqual([logo.scope, logo.partnerId, logo.eventId], ['partner', 'P', undefined]);
  assert.deepEqual([logo.width, logo.height, logo.mimeType, logo.usageCount, logo.isActive], [400, 100, 'image/png', 0, true]);
  assert.equal(logo.thumbnailUrl, 'https://blob.example/frame.png');
  assert.equal(data.frames.length, 0);
});

test('a user without manager access to the partner cannot upload for it', async (t) => {
  const { data, stored } = setup(t, { allowed: false });
  const { POST } = await importRoute('forbidden');
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, png()), params)).status, 403);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
});

test('a logo uploaded with slot=logo becomes one of the partner\'s logos at once (camera#419), next to the ones it has', async (t) => {
  const { data } = setup(t);
  (data.partners[0] as Record<string, unknown>).slots = { logo: { items: ['existing'] } };
  const { POST } = await importRoute('slot-logo');
  (data.logos as Array<Record<string, unknown>>).push({ logoId: 'existing', name: 'Existing', imageUrl: 'https://img.example/e.png', isActive: true, scope: 'partner', partnerId: 'P' });
  const response = await POST(post({ kind: 'logos', slot: 'logo', name: 'New logo' }, png()), params);
  assert.equal(response.status, 201);
  const own = data.logos.find((logo) => logo.name === 'New logo') as Record<string, unknown>;
  assert.equal(own.scope, 'partner');
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, ['existing', own.logoId as string]);
});

test('a logo uploaded without a slot only joins the partner library, as before', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('no-slot');
  assert.equal((await POST(post({ kind: 'logos', name: 'Plain' }, png()), params)).status, 201);
  assert.equal((data.partners[0] as { slots?: unknown }).slots, undefined);
});
