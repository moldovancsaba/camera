import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
const id = new ObjectId().toHexString();
const session = { user: { id: 'u1', email: 'admin@example.com' }, appRole: 'admin', appAccess: true } as unknown as Session;
const tileImage = 'https://abc123.public.blob.vercel-storage.com/events/frame.png';
const hexColor = (...parts: string[]) => `${String.fromCharCode(35)}${parts.join('')}`;
const selectionContext = {
  layouts: [{ id: 'layout-a', name: 'Home', previewUrl: tileImage }, { id: 'layout-b', name: 'Away', previewUrl: tileImage }],
  messages: [{ text: 'Go', shown: 'Go' }],
  situation: 'C' as const,
  selection: null,
  today: { layout: { mode: 'random' as const, pick: null }, message: { mode: 'random' as const, pick: null } },
};

function setup(t: import('node:test').TestContext, options: { deny?: boolean } = {}) {
  const updates: unknown[] = [];
  const event = { _id: new ObjectId(id), frameSelectionTiles: { 'removed-layout': { color: hexColor('11', '22', '33') } } };
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => session, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    exports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => event, updateOne: async (_filter: unknown, update: unknown) => (updates.push(update), { matchedCount: 1 }) }) }) },
  });
  t.mock.module('@/lib/partners/authorization', {
    exports: { assertGlobalAdminOrPartnerEventAccess: async () => { if (options.deny) throw apiReal.apiForbidden('No access to this event'); } },
  });
  t.mock.module('@/lib/frame/selection-options', { exports: { loadSelectionContext: async () => selectionContext } });
  return { updates };
}

const req = (body: unknown) => new NextRequest(`http://localhost/api/admin/events/${id}/frame-selection`, { method: 'PUT', body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id }) };

test('PUT saves the choice rules and square tile image or colour settings', async (t) => {
  const { updates } = setup(t);
  const { PUT } = await importRoute('save-tiles');
  const tiles = { 'layout-a': { imageUrl: tileImage }, 'layout-b': { color: hexColor('12', 'ab', 'ef') } };
  const response = await PUT(req({ selection: { layout: { mode: 'user' }, message: { mode: 'user' } }, tiles }), ctx);
  assert.equal(response.status, 200);
  const savedTiles = { ...tiles, 'layout-b': { color: hexColor('12', 'AB', 'EF') } };
  assert.deepEqual((await response.json() as { data: { tiles: unknown } }).data.tiles, savedTiles);
  const update = updates[0] as { $set: Record<string, unknown>; $unset: Record<string, unknown> };
  assert.deepEqual(update.$set.frameSelection, { layout: { mode: 'user', pick: null }, message: { mode: 'user', pick: null } });
  assert.deepEqual(update.$set.frameSelectionTiles, savedTiles);
  assert.ok(typeof update.$set.updatedAt === 'string');
  assert.equal(update.$unset, undefined);
});

test('PUT ignores settings for removed layouts and refuses unsafe pictures or colours without saving', async (t) => {
  const { updates } = setup(t);
  const { PUT } = await importRoute('invalid-tiles');
  const base = { selection: null };
  const stale = await PUT(req({ ...base, tiles: { 'removed-layout': { color: hexColor('11', '22', '33') }, 'layout-a': { color: hexColor('AA', 'BB', 'CC') } } }), ctx);
  assert.equal(stale.status, 200);
  assert.deepEqual((await stale.json() as { data: { tiles: unknown } }).data.tiles, { 'layout-a': { color: hexColor('AA', 'BB', 'CC') } });
  const badImage = await PUT(req({ ...base, tiles: { 'layout-a': { imageUrl: 'https://example.com/frame.png' } } }), ctx);
  const badColor = await PUT(req({ ...base, tiles: { 'layout-a': { color: 'red' } } }), ctx);
  assert.equal(badImage.status, 400);
  assert.equal(badColor.status, 400);
  assert.equal(updates.length, 1, 'refused settings do not write');
});

test('PUT needs manager access and writes nothing for a caller without it', async (t) => {
  const { updates } = setup(t, { deny: true });
  const { PUT } = await importRoute('denied');
  assert.equal((await PUT(req({ selection: null }), ctx)).status, 403);
  assert.equal(updates.length, 0);
});
