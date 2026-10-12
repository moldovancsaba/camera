import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const PLAN = { pictures: 1, tryOnResults: 0, composed: { imgbbOnly: 1, blobOnly: 0, blobOnlyOldMirror: 0, both: 0, other: 0 }, unframed: { blobOnly: 0, imgbbOnly: 0, both: 0, waiting: 0, rejected: 0, keptUnverified: 0 }, copies: { notMade: 0, couldNotVerify: 0, photosWithAProblem: 0 }, toDo: { rescue: 1, mirror: 0, unframed: 0 } };

function setup(t: import('node:test').TestContext, options: { admin?: boolean } = {}) {
  const calls = { plan: 0, probe: [] as unknown[], run: [] as unknown[] };
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ({ user: { id: 'u1', email: 'a@example.test' } }), checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/partners/authorization', { exports: { isGlobalAdminSession: () => options.admin !== false } });
  t.mock.module('@/lib/storage/image-safety', {
    exports: {
      SAFETY_KINDS: ['rescue', 'mirror', 'unframed'],
      planImageSafety: async () => (calls.plan += 1, PLAN),
      probeImageSafety: async (_db: unknown, o: unknown) => (calls.probe.push(o), { processed: 2, addresses: 3, ok: 3, gone: 0, unknown: 0, goneList: [], next: null }),
      runImageSafetyBatch: async (_db: unknown, o: unknown) => (calls.run.push(o), { kind: 'rescue', processed: 1, scanned: 1, counts: { copied: 1, deleted: 0, failed: 0 }, bytes: 10, failures: [], next: null }),
    },
  });
  return calls;
}
const url = 'http://localhost/api/admin/image-safety';
const get = (query = '') => new NextRequest(url + query);
const post = (body?: unknown) => new NextRequest(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

test('GET is the count: it reads and writes nothing, and asks no host', async (t) => {
  const calls = setup(t);
  const { GET } = await importRoute('plan');
  const res = await GET(get());
  assert.deepEqual(((await res.json()) as { data: unknown }).data, PLAN);
  assert.deepEqual([calls.plan, calls.probe.length, calls.run.length], [1, 0, 0]);
});

test('GET with probe=1 is one batch of the address check, from the cursor and with the limit it is given', async (t) => {
  const calls = setup(t);
  const { GET } = await importRoute('probe');
  const after = new ObjectId().toHexString();
  const res = await GET(get(`?probe=1&after=${after}&limit=15`));
  assert.equal(res.status, 200);
  const o = calls.probe[0] as { after: ObjectId; limit: number };
  assert.deepEqual([String(o.after), o.limit], [after, 15]);
  assert.equal(calls.plan, 0);
  assert.equal((await GET(get('?probe=1'))).status, 200);
  assert.deepEqual(calls.probe[1], { after: undefined, limit: undefined });
});

test('GET refuses a bad cursor or limit', async (t) => {
  const calls = setup(t);
  const { GET } = await importRoute('probe-bad');
  assert.equal((await GET(get('?probe=1&after=nope'))).status, 400);
  assert.equal((await GET(get('?probe=1&limit=many'))).status, 400);
  assert.equal(calls.probe.length, 0);
});

test('POST runs one batch of one kind, from a cursor, only with confirm: true', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('run');
  const after = new ObjectId().toHexString();
  const res = await POST(post({ confirm: true, kind: 'mirror', after, limit: 4 }));
  assert.equal(res.status, 200);
  const o = calls.run[0] as { kind: string; after: ObjectId; limit: number };
  assert.deepEqual([o.kind, String(o.after), o.limit], ['mirror', after, 4]);
  assert.equal((await POST(post({ confirm: true, kind: 'unframed' }))).status, 200);
  assert.deepEqual(calls.run[1], { kind: 'unframed', after: undefined, limit: undefined });
});

test('POST without confirm, without a kind, with a kind it does not know, "all", or a bad cursor or limit is refused and runs nothing', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('refuse');
  for (const body of [undefined, {}, { kind: 'rescue' }, { confirm: 'yes', kind: 'rescue' }, { confirm: true }, { confirm: true, kind: 'all' }, { confirm: true, kind: 'delete' }, { confirm: true, kind: 'rescue', after: 'nope' }, { confirm: true, kind: 'rescue', limit: 'many' }]) {
    assert.equal((await POST(post(body))).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.run.length, 0);
});

test('every method is for global admins only: anyone else gets 403 and nothing is read or made', async (t) => {
  const calls = setup(t, { admin: false });
  const { GET, POST } = await importRoute('forbidden');
  assert.equal((await GET(get())).status, 403);
  assert.equal((await GET(get('?probe=1'))).status, 403);
  assert.equal((await POST(post({ confirm: true, kind: 'rescue' }))).status, 403);
  assert.deepEqual([calls.plan, calls.probe.length, calls.run.length], [0, 0, 0]);
});
