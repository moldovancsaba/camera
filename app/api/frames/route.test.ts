import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, createdAt: `2026-10-0${frameId.length}T00:00:00.000Z`, ...extra });

function setup(t: TestContext) {
  const seeded = fakeDb({
    frames: [
      frame('g1'),
      frame('g2', { scope: 'global' }),
      frame('g3', { scope: null, isActive: false }),
      frame('p1', { scope: 'partner', partnerId: 'P' }),
      frame('e1', { scope: 'event', eventId: 'e-uuid' }),
    ],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  return seeded;
}

const get = (query = '') => new NextRequest(`http://localhost/api/frames${query}`);
const ids = async (response: Response) => ((await response.json()) as { data: { frames: Array<{ frameId: string }> } }).data.frames.map((f) => f.frameId).sort();

test('the global frame list holds the global frames only: what a partner or an event uploaded for itself is not offered to everyone', async (t) => {
  setup(t);
  const { GET } = await importRoute('global-only');
  assert.deepEqual(await ids(await GET(get())), ['g1', 'g2', 'g3']);
});

test('the active filter keeps working next to the scope', async (t) => {
  setup(t);
  const { GET } = await importRoute('active');
  assert.deepEqual(await ids(await GET(get('?active=true'))), ['g1', 'g2']);
});
