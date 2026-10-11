import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
type ItemRouteModule = typeof import('./[qrTextId]/route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
const importItemRoute = (caseId: string) => import('./[qrTextId]/route?case=' + caseId) as Promise<ItemRouteModule>;
const row = (qrTextId: string, text: string, language = 'en', extra: Record<string, unknown> = {}) => ({ qrTextId, text, language, isActive: true, createdAt: `2026-10-0${qrTextId.length}T00:00:00.000Z`, ...extra });

function setup(t: TestContext, options: { admin?: boolean } = {}) {
  const seeded = fakeDb({ qr_texts: [row('a', 'Scan & smile'), row('bb', 'Szkenneld!', 'hu', { isActive: false })] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAdmin: async () => { if (options.admin === false) throw apiReal.apiForbidden('Admin access required for this app'); return ADMIN; } } });
  return seeded;
}

const post = (body: unknown) => new NextRequest('http://localhost/api/qr-texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patch = (body: unknown) => new NextRequest('http://localhost/api/qr-texts/a', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (qrTextId: string) => ({ params: Promise.resolve({ qrTextId }) });

test('GET lists the QR texts, switched off ones included, newest first', async (t) => {
  setup(t);
  const { GET } = await importRoute('get');
  const body = (await (await GET()).json()) as { data: { items: Array<{ id: string; text: string; isActive: boolean }> } };
  assert.deepEqual(body.data.items.map((item) => [item.id, item.isActive]), [['bb', false], ['a', true]]);
});

test('POST adds a text in a language; a bad text, a language we do not have and a duplicate are refused', async (t) => {
  const w = setup(t);
  const { POST } = await importRoute('post');
  const response = await POST(post({ text: 'Be on screen', language: 'en' }));
  assert.equal(response.status, 201);
  assert.equal(w.data.qr_texts.length, 3);
  assert.equal((w.data.qr_texts[2] as { createdBy: string }).createdBy, 'a1');
  assert.equal((await POST(post({ text: '', language: 'en' }))).status, 400);
  assert.equal((await POST(post({ text: 'Hallo', language: 'de' }))).status, 400);
  assert.equal((await POST(new NextRequest('http://localhost/api/qr-texts', { method: 'POST', body: 'not json' }))).status, 400);
  assert.equal((await POST(post({ text: 'scan & smile', language: 'en' }))).status, 409);
  assert.equal(w.data.qr_texts.length, 3, 'a refused text writes nothing');
});

test('PATCH switches a text off or on; DELETE removes it; an unknown one is 404 and a bad body 400', async (t) => {
  const w = setup(t);
  const { PATCH, DELETE } = await importItemRoute('item');
  assert.equal((await PATCH(patch({ isActive: false }), ctx('a'))).status, 200);
  assert.equal((w.data.qr_texts[0] as { isActive: boolean }).isActive, false);
  assert.equal((await PATCH(patch({ isActive: 'yes' }), ctx('a'))).status, 400);
  assert.equal((await PATCH(patch({ isActive: true }), ctx('nope'))).status, 404);
  assert.equal((await DELETE(new NextRequest('http://localhost/api/qr-texts/a', { method: 'DELETE' }), ctx('a'))).status, 200);
  assert.equal(w.data.qr_texts.length, 1);
  assert.equal((await DELETE(new NextRequest('http://localhost/api/qr-texts/a', { method: 'DELETE' }), ctx('a'))).status, 404);
});

test('only global admins can list, add, switch or delete', async (t) => {
  setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  const { PATCH, DELETE } = await importItemRoute('forbidden');
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(post({ text: 'x', language: 'en' }))).status, 403);
  assert.equal((await PATCH(patch({ isActive: false }), ctx('a'))).status, 403);
  assert.equal((await DELETE(new NextRequest('http://localhost/api/qr-texts/a', { method: 'DELETE' }), ctx('a'))).status, 403);
});
