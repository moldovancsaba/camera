import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;
const get = (token?: string) => new NextRequest('http://localhost/api/internal/pictures-scan', { headers: token ? { authorization: `Bearer ${token}` } : {} });

const LOGO = 'https://i.ibb.co/aaa/club-logo.png';
// Module level: lib/media/pictures.ts is imported once and keeps the first mock of lib/media/broken, so every test must reach the same list.
const checked: string[] = [];

function setup(t: TestContext, secret: string | undefined) {
  const seeded = fakeDb({ events: [{ _id: 'e1', name: 'MTK x Vasas', logoUrl: LOGO }] });
  checked.length = 0;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  t.after(() => delete process.env.CRON_SECRET);
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  // The photos have their own tests (lib/media/broken.test.ts): here the walk over them is empty, and the other pictures are asked of a fake host that has lost the logo.
  t.mock.module('@/lib/media/broken', {
    namedExports: {
      scanBatch: async () => ({ processed: 0, counts: {}, next: null, remaining: 0 }),
      checkPicture: async (url: string) => (checked.push(url), 'broken'),
    },
  });
  return { ...seeded, checked };
}

test('without the cron secret, or with a wrong one, nothing is checked and the answer is 403 (fail closed)', async (t) => {
  const w = setup(t, undefined);
  const { GET } = await load('closed');
  assert.equal((await GET(get())).status, 403, 'CRON_SECRET not set on the project');
  process.env.CRON_SECRET = 'right';
  assert.equal((await GET(get('wrong'))).status, 403);
  assert.equal(w.checked.length, 0);
});

test('with the secret the pictures in use are checked and a gone one is recorded (hidden), nothing is deleted', async (t) => {
  const w = setup(t, 'right');
  const { GET } = await load('open');
  const response = await GET(get('right'));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { items: { processed: number; broken: number; remaining: number } } };
  assert.deepEqual(body.data.items, { processed: 1, broken: 1, cleared: 0, unknown: 0, remaining: 0 });
  assert.deepEqual(w.checked, [LOGO]);
  assert.equal(w.data.picture_health[0]._id, LOGO);
  assert.equal(w.data.picture_health[0].broken, true);
  assert.equal(w.data.events.length, 1);
});
