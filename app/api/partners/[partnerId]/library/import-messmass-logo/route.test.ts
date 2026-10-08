import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const PARTNER_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const R2 = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/mtk.png';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

async function setup(t: TestContext, options: { allowed?: boolean; logoUrl?: string | null } = {}) {
  const seeded = fakeDb({
    logos: [],
    partners: [{ _id: PARTNER_MONGO_ID, partnerId: 'P', name: 'MTK Budapest', ...(options.logoUrl === null ? {} : { logoUrl: options.logoUrl ?? R2 }) }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', logos: [] }],
  });
  const minRoles: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertPartnerMongoWorkspaceAccess: async (db: typeof seeded.db, _session: unknown, _id: string, minRole: string) => {
        minRoles.push(minRole);
        if (options.allowed === false) throw apiReal.apiForbidden('Partner-level manager access is required');
        return { partner: await db.collection('partners').findOne({ _id: PARTNER_MONGO_ID }), role: 'admin', partnerId: 'P' };
      },
    },
  });
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 80, b: 160, alpha: 1 } } }).png().toBuffer();
  const downloads: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    downloads.push(String(url));
    return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } });
  });
  return { ...seeded, minRoles, downloads };
}

const params = { params: Promise.resolve({ partnerId: String(PARTNER_MONGO_ID) }) };
const url = `http://localhost/api/partners/${PARTNER_MONGO_ID}/library/import-messmass-logo`;
interface Body { data: { item: { id: string; scope: string; source?: string; imageUrl: string } | null; created?: boolean; logoUrl?: string | null; problem?: string | null }; error?: string }

test('POST imports the logo as a partner item from messmass (201); a second POST returns the same item (200)', async (t) => {
  const { data, minRoles, downloads } = await setup(t);
  const { POST } = await importRoute('import');
  const first = await POST(new NextRequest(url, { method: 'POST' }), params);
  assert.equal(first.status, 201);
  const body = (await first.json()) as Body;
  assert.equal(body.data.created, true);
  assert.equal(body.data.item?.scope, 'partner');
  assert.equal(body.data.item?.source, 'messmass');
  assert.equal(body.data.item?.imageUrl, R2);
  const again = await POST(new NextRequest(url, { method: 'POST' }), params);
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as Body).data.item?.id, body.data.item?.id);
  assert.equal(data.logos.length, 1);
  assert.deepEqual(downloads, [R2]);
  assert.deepEqual(minRoles, ['manager', 'manager'], 'importing needs manager access to the partner');
  assert.deepEqual(data.events[0].logos, [], 'no event is changed');
});

test('GET says whether the logo can be imported, then that it is', async (t) => {
  await setup(t);
  const { GET, POST } = await importRoute('state');
  const before = (await (await GET(new NextRequest(url), params)).json()) as Body;
  assert.deepEqual(before.data, { logoUrl: R2, item: null, problem: null });
  await POST(new NextRequest(url, { method: 'POST' }), params);
  const after = (await (await GET(new NextRequest(url), params)).json()) as Body;
  assert.equal(after.data.item?.source, 'messmass');
});

test('a partner without a logo from messmass gets a plain 400 and nothing is stored', async (t) => {
  const { data, downloads } = await setup(t, { logoUrl: null });
  const { POST, GET } = await importRoute('none');
  const response = await POST(new NextRequest(url, { method: 'POST' }), params);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as Body).error ?? '', /no logo from messmass/);
  assert.equal(data.logos.length, 0);
  assert.deepEqual(downloads, []);
  assert.equal(((await (await GET(new NextRequest(url), params)).json()) as Body).data.problem, 'This partner has no logo from messmass.');
});

test('a logo on a host camera does not trust is not downloaded', async (t) => {
  const { data, downloads } = await setup(t, { logoUrl: 'https://tracker.example/logo.png' });
  const { POST } = await importRoute('untrusted');
  assert.equal((await POST(new NextRequest(url, { method: 'POST' }), params)).status, 400);
  assert.deepEqual(downloads, []);
  assert.equal(data.logos.length, 0);
});

test('without manager access to the partner nothing is imported', async (t) => {
  const { data, downloads } = await setup(t, { allowed: false });
  const { POST } = await importRoute('forbidden');
  assert.equal((await POST(new NextRequest(url, { method: 'POST' }), params)).status, 403);
  assert.equal(data.logos.length, 0);
  assert.deepEqual(downloads, []);
});
